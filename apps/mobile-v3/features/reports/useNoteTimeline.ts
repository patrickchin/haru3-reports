import { useMemo } from 'react';
import type { PendingNote } from '@/features/voice/useVoiceNotePipeline';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Note {
  id: string;
  reportId: string;
  kind: 'text' | 'voice' | 'image' | 'video' | 'document';
  body: string | null;
  sortOrder: number;
  fileId: string | null;
  createdAt: string;
}

export interface TimelineEntry {
  id: string;
  kind: Note['kind'];
  body: string | null;
  fileId: string | null;
  createdAt: string;
  isPending: boolean;
  pendingStatus?: PendingNote['status'];
  pendingError?: string;
  thumbnailUri?: string;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Merges persisted notes with in-flight pending voice/image notes into a
 * single sorted timeline. Pending notes whose final persisted version already
 * appeared in `notes` are de-duped automatically (by matching `fileId`).
 */
export function useNoteTimeline(
  notes: Note[] | undefined,
  pendingNotes: PendingNote[],
): TimelineEntry[] {
  return useMemo(() => {
    const persistedFileIds = new Set(
      (notes ?? []).filter((n) => n.fileId).map((n) => n.fileId),
    );

    const persistedEntries: TimelineEntry[] = (notes ?? []).map((n) => ({
      id: n.id,
      kind: n.kind,
      body: n.body,
      fileId: n.fileId,
      createdAt: n.createdAt,
      isPending: false,
    }));

    // Only include pending notes that haven't been persisted yet
    const pendingEntries: TimelineEntry[] = pendingNotes
      .filter((p) => {
        if (p.status === 'saved') return false;
        if (p.fileId && persistedFileIds.has(p.fileId)) return false;
        return true;
      })
      .map((p) => ({
        id: p.id,
        kind: 'voice' as const,
        body: p.transcript ?? null,
        fileId: p.fileId ?? null,
        createdAt: new Date().toISOString(),
        isPending: true,
        pendingStatus: p.status,
        pendingError: p.error,
        thumbnailUri: p.uri,
      }));

    // Sort oldest first
    return [...persistedEntries, ...pendingEntries].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
  }, [notes, pendingNotes]);
}
