import React, { createContext, useContext, useEffect, useRef, useCallback } from 'react';
import { observable } from '@legendapp/state';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQueryClient } from '@tanstack/react-query';
import { usePresignUpload, useCreateFile } from '@/lib/api/hooks';
import { keys } from '@/lib/api/keys';
// expo-file-system v55+ uses class-based API; we use fetch for uploads

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UploadJob {
  id: string;
  status: 'pending' | 'uploading' | 'completed' | 'failed';
  fileUri: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  category: 'image' | 'document' | 'voice-note';
  reportId: string;
  projectId: string;
  progress: number;
  retryCount: number;
  lastError?: string;
  storagePath?: string;
  fileId?: string;
  addedAt: number;
}

interface UploadQueueState {
  jobs: UploadJob[];
}

// ---------------------------------------------------------------------------
// Observable (exported so useUploadQueue can read it)
// ---------------------------------------------------------------------------

export const uploadQueue$ = observable<UploadQueueState>({ jobs: [] });

const STORAGE_KEY = 'upload-queue';
const MAX_RETRIES = 3;

// Persistence helpers
async function persist() {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(uploadQueue$.jobs.get()));
  } catch {
    // best-effort
  }
}

async function hydrate() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed: UploadJob[] = JSON.parse(raw);
      // Reset any "uploading" jobs that were interrupted back to pending
      const restored = parsed
        .filter((j) => j.status !== 'completed')
        .map((j) => (j.status === 'uploading' ? { ...j, status: 'pending' as const } : j));
      uploadQueue$.jobs.set(restored);
    }
  } catch {
    // best-effort
  }
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface UploadQueueActions {
  enqueue: (job: Omit<UploadJob, 'id' | 'status' | 'progress' | 'retryCount' | 'addedAt'>) => void;
  retry: (jobId: string) => void;
  cancel: (jobId: string) => void;
  removeCompleted: () => void;
}

const UploadQueueContext = createContext<UploadQueueActions | null>(null);

export function useUploadQueueActions(): UploadQueueActions {
  const ctx = useContext(UploadQueueContext);
  if (!ctx) throw new Error('useUploadQueueActions must be used within UploadQueueProvider');
  return ctx;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function UploadQueueProvider({ children }: { children: React.ReactNode }) {
  const processingRef = useRef(false);
  const qc = useQueryClient();
  const presign = usePresignUpload();
  const createFile = useCreateFile();

  // Hydrate on mount
  useEffect(() => {
    hydrate().then(() => processNext());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const processNext = useCallback(async () => {
    if (processingRef.current) return;

    const jobs = uploadQueue$.jobs.get();
    const next = jobs.find((j) => j.status === 'pending');
    if (!next) return;

    processingRef.current = true;

    // Mark uploading
    updateJob(next.id, { status: 'uploading', progress: 0 });

    try {
      // 1. Presign
      const { signedUrl, storagePath } = await presign.mutateAsync({
        fileName: next.fileName,
        mimeType: next.mimeType,
        category: next.category,
      });

      updateJob(next.id, { progress: 20, storagePath });

      // 2. Upload file via fetch (platform-specific background upload comes later)
      const fileResponse = await fetch(next.fileUri);
      const blob = await fileResponse.blob();

      const uploadRes = await fetch(signedUrl, {
        method: 'PUT',
        headers: { 'Content-Type': next.mimeType },
        body: blob,
      });

      if (!uploadRes.ok) {
        throw new Error(`Upload failed with status ${uploadRes.status}`);
      }

      updateJob(next.id, { progress: 70 });

      // 3. Register file in DB
      const fileRecord = await createFile.mutateAsync({
        projectId: next.projectId,
        reportId: next.reportId,
        storagePath,
        category: next.category,
        filename: next.fileName,
        mimeType: next.mimeType,
        sizeBytes: next.sizeBytes,
      });

      updateJob(next.id, {
        status: 'completed',
        progress: 100,
        fileId: fileRecord.id,
        storagePath,
      });

      // Invalidate caches
      qc.invalidateQueries({ queryKey: keys.files.list(next.projectId) });
    } catch (err: any) {
      const retryCount = next.retryCount + 1;
      updateJob(next.id, {
        status: retryCount >= MAX_RETRIES ? 'failed' : 'pending',
        retryCount,
        lastError: err?.message ?? 'Unknown error',
        progress: 0,
      });
    }

    await persist();
    processingRef.current = false;
    processNext();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const enqueue = useCallback(
    (partial: Omit<UploadJob, 'id' | 'status' | 'progress' | 'retryCount' | 'addedAt'>) => {
      const job: UploadJob = {
        ...partial,
        id: `upload_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        status: 'pending',
        progress: 0,
        retryCount: 0,
        addedAt: Date.now(),
      };
      uploadQueue$.jobs.set([...uploadQueue$.jobs.get(), job]);
      persist();
      processNext();
    },
    [processNext],
  );

  const retry = useCallback(
    (jobId: string) => {
      updateJob(jobId, { status: 'pending', retryCount: 0, lastError: undefined, progress: 0 });
      persist();
      processNext();
    },
    [processNext],
  );

  const cancel = useCallback((jobId: string) => {
    uploadQueue$.jobs.set(uploadQueue$.jobs.get().filter((j) => j.id !== jobId));
    persist();
  }, []);

  const removeCompleted = useCallback(() => {
    uploadQueue$.jobs.set(uploadQueue$.jobs.get().filter((j) => j.status !== 'completed'));
    persist();
  }, []);

  return (
    <UploadQueueContext.Provider value={{ enqueue, retry, cancel, removeCompleted }}>
      {children}
    </UploadQueueContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function updateJob(id: string, patch: Partial<UploadJob>) {
  uploadQueue$.jobs.set(
    uploadQueue$.jobs.get().map((j) => (j.id === id ? { ...j, ...patch } : j)),
  );
}
