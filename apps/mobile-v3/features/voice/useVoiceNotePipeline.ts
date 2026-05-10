import { useCallback, useRef, useState } from 'react';
import { File as ExpoFile } from 'expo-file-system';
import { useAudio } from '@/features/audio/AudioProvider';
import {
  useCreateNote,
  useTranscribe,
  usePresignUpload,
  useCreateFile,
} from '@/lib/api/hooks';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PendingNoteStatus = 'uploading' | 'transcribing' | 'saved' | 'failed';

export interface PendingNote {
  id: string;
  status: PendingNoteStatus;
  error?: string;
  transcript?: string;
  fileId?: string;
  uri?: string;
  /** Which step failed so retry can resume from there. */
  failedStep?: 'upload' | 'transcribe' | 'create-note';
}

export interface UseVoiceNotePipelineResult {
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
  isRecording: boolean;
  amplitudes: number[];
  pendingNotes: PendingNote[];
  retry: (noteId: string) => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useVoiceNotePipeline(
  reportId: string,
  projectId: string,
): UseVoiceNotePipelineResult {
  const audio = useAudio();
  const [pendingNotes, setPendingNotes] = useState<PendingNote[]>([]);
  const idCounter = useRef(0);

  const presignUpload = usePresignUpload();
  const createFile = useCreateFile();
  const transcribe = useTranscribe();
  const createNote = useCreateNote();

  // --------------------------------------------------
  // Helpers to update a specific pending note
  // --------------------------------------------------
  const updateNote = useCallback(
    (id: string, patch: Partial<PendingNote>) => {
      setPendingNotes((prev) =>
        prev.map((n) => (n.id === id ? { ...n, ...patch } : n)),
      );
    },
    [],
  );

  // --------------------------------------------------
  // Pipeline steps
  // --------------------------------------------------

  const runUpload = useCallback(
    async (noteId: string, uri: string): Promise<string> => {
      updateNote(noteId, { status: 'uploading' });

      const sourceFile = new ExpoFile(uri);
      const fileSize = sourceFile.exists ? sourceFile.size ?? 0 : 0;
      const fileName = `voice-${Date.now()}.m4a`;

      // 1. Get presigned URL
      const presign = await presignUpload.mutateAsync({
        fileName,
        mimeType: 'audio/m4a',
        category: 'voice',
      });

      // 2. Upload to storage via fetch (expo-file-system/next doesn't have uploadAsync)
      const fileBlob = await fetch(uri).then((r) => r.blob());
      await fetch(presign.signedUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'audio/m4a' },
        body: fileBlob,
      });

      // 3. Create file record
      const fileRecord = await createFile.mutateAsync({
        projectId,
        reportId,
        storagePath: presign.storagePath,
        category: 'voice',
        filename: fileName,
        mimeType: 'audio/m4a',
        sizeBytes: fileSize,
      });

      return fileRecord.id as string;
    },
    [presignUpload, createFile, projectId, reportId, updateNote],
  );

  const runTranscribe = useCallback(
    async (noteId: string, fileId: string): Promise<string> => {
      updateNote(noteId, { status: 'transcribing', fileId });

      const result = await transcribe.mutateAsync(fileId);
      const transcript: string = result.transcript ?? result.text ?? '';

      updateNote(noteId, { transcript });
      return transcript;
    },
    [transcribe, updateNote],
  );

  const runCreateNote = useCallback(
    async (noteId: string, fileId: string, transcript: string) => {
      await createNote.mutateAsync({
        reportId,
        kind: 'voice',
        body: transcript,
        fileId,
      });

      updateNote(noteId, { status: 'saved' });
    },
    [createNote, reportId, updateNote],
  );

  // --------------------------------------------------
  // Full pipeline
  // --------------------------------------------------

  const runPipeline = useCallback(
    async (noteId: string, uri: string, fromStep?: PendingNote['failedStep'], existingFileId?: string) => {
      try {
        let fileId = existingFileId ?? '';

        if (!fromStep || fromStep === 'upload') {
          fileId = await runUpload(noteId, uri);
        }

        let transcript = '';
        if (!fromStep || fromStep === 'upload' || fromStep === 'transcribe') {
          transcript = await runTranscribe(noteId, fileId);
        }

        if (!fromStep || fromStep !== undefined) {
          await runCreateNote(noteId, fileId, transcript);
        }
      } catch (err: any) {
        const step = presignUpload.isError || createFile.isError
          ? 'upload' as const
          : transcribe.isError
            ? 'transcribe' as const
            : 'create-note' as const;

        updateNote(noteId, {
          status: 'failed',
          error: err?.message ?? 'Unknown error',
          failedStep: step,
        });
      }
    },
    [runUpload, runTranscribe, runCreateNote, presignUpload.isError, createFile.isError, transcribe.isError, updateNote],
  );

  // --------------------------------------------------
  // Public API
  // --------------------------------------------------

  const startRecording = useCallback(async () => {
    await audio.startRecording();
  }, [audio]);

  const stopRecording = useCallback(async () => {
    const uri = await audio.stopRecording();
    if (!uri) return;

    idCounter.current += 1;
    const noteId = `pending-${Date.now()}-${idCounter.current}`;

    const newNote: PendingNote = {
      id: noteId,
      status: 'uploading',
      uri,
    };

    setPendingNotes((prev) => [...prev, newNote]);

    // Fire and forget — state updates happen inside runPipeline
    runPipeline(noteId, uri);
  }, [audio, runPipeline]);

  const retry = useCallback(
    (noteId: string) => {
      const note = pendingNotes.find((n) => n.id === noteId);
      if (!note || !note.uri) return;

      updateNote(noteId, { status: 'uploading', error: undefined });
      runPipeline(noteId, note.uri, note.failedStep, note.fileId);
    },
    [pendingNotes, updateNote, runPipeline],
  );

  return {
    startRecording,
    stopRecording,
    isRecording: audio.isRecording,
    amplitudes: audio.amplitudes,
    pendingNotes,
    retry,
  };
}
