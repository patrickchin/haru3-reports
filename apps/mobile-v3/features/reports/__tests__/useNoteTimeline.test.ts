import { describe, it, expect, vi } from 'vitest';
import type { Note, TimelineEntry } from '../useNoteTimeline';
import type { PendingNote } from '@/features/voice/useVoiceNotePipeline';

// ---------------------------------------------------------------------------
// We test the merge/dedup/sort logic without React by extracting the useMemo
// body. We mock `useMemo` to execute the factory synchronously.
// ---------------------------------------------------------------------------

vi.mock('react', () => ({
  useMemo: (fn: () => unknown) => fn(),
}));

// Import AFTER mock so the hook uses our passthrough useMemo
const { useNoteTimeline } = await import('../useNoteTimeline');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    id: 'n1',
    reportId: 'r1',
    kind: 'text',
    body: 'hello',
    sortOrder: 0,
    fileId: null,
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makePending(overrides: Partial<PendingNote> = {}): PendingNote {
  return {
    id: 'p1',
    status: 'uploading',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useNoteTimeline', () => {
  describe('persisted notes mapping', () => {
    it('maps persisted notes to TimelineEntry with isPending=false', () => {
      const notes = [makeNote({ id: 'n1', body: 'hello' })];
      const result = useNoteTimeline(notes, []);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: 'n1',
        kind: 'text',
        body: 'hello',
        isPending: false,
      });
      expect(result[0].pendingStatus).toBeUndefined();
    });

    it('returns empty array when notes is undefined and no pending', () => {
      const result = useNoteTimeline(undefined, []);
      expect(result).toEqual([]);
    });
  });

  describe('pending notes mapping', () => {
    it('includes pending notes with isPending=true', () => {
      const pending = [makePending({ id: 'p1', status: 'uploading', uri: '/tmp/a.m4a' })];
      const result = useNoteTimeline([], pending);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: 'p1',
        kind: 'voice',
        isPending: true,
        pendingStatus: 'uploading',
        thumbnailUri: '/tmp/a.m4a',
      });
    });

    it('includes transcript as body when present', () => {
      const pending = [makePending({ transcript: 'hello world' })];
      const result = useNoteTimeline([], pending);

      expect(result[0].body).toBe('hello world');
    });

    it('sets body to null when no transcript', () => {
      const pending = [makePending({ transcript: undefined })];
      const result = useNoteTimeline([], pending);

      expect(result[0].body).toBeNull();
    });

    it('carries pendingError through', () => {
      const pending = [makePending({ status: 'failed', error: 'network' })];
      const result = useNoteTimeline([], pending);

      expect(result[0].pendingError).toBe('network');
    });
  });

  describe('deduplication', () => {
    it('filters out pending notes whose fileId already exists in persisted notes', () => {
      const notes = [makeNote({ id: 'n1', fileId: 'file-abc' })];
      const pending = [makePending({ id: 'p1', fileId: 'file-abc', status: 'uploading' })];

      const result = useNoteTimeline(notes, pending);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('n1');
      expect(result[0].isPending).toBe(false);
    });

    it('keeps pending notes with a fileId not yet persisted', () => {
      const notes = [makeNote({ id: 'n1', fileId: 'file-abc' })];
      const pending = [makePending({ id: 'p1', fileId: 'file-xyz', status: 'uploading' })];

      const result = useNoteTimeline(notes, pending);
      expect(result).toHaveLength(2);
    });

    it('filters out pending notes with status "saved"', () => {
      const pending = [makePending({ id: 'p1', status: 'saved' })];
      const result = useNoteTimeline([], pending);

      expect(result).toHaveLength(0);
    });

    it('keeps pending notes without fileId (not yet uploaded)', () => {
      const notes = [makeNote({ fileId: 'file-abc' })];
      const pending = [makePending({ id: 'p1', fileId: undefined, status: 'uploading' })];

      const result = useNoteTimeline(notes, pending);
      expect(result).toHaveLength(2);
    });
  });

  describe('sorting', () => {
    it('sorts entries oldest-first by createdAt', () => {
      const notes = [
        makeNote({ id: 'n2', createdAt: '2026-01-03T00:00:00Z' }),
        makeNote({ id: 'n1', createdAt: '2026-01-01T00:00:00Z' }),
        makeNote({ id: 'n3', createdAt: '2026-01-02T00:00:00Z' }),
      ];

      const result = useNoteTimeline(notes, []);

      expect(result.map((e) => e.id)).toEqual(['n1', 'n3', 'n2']);
    });

    it('interleaves persisted and pending by date', () => {
      const notes = [makeNote({ id: 'n1', createdAt: '2026-01-01T00:00:00Z' })];
      // Pending entries get `new Date().toISOString()` which is always after 2026-01-01
      const pending = [makePending({ id: 'p1', status: 'uploading' })];

      const result = useNoteTimeline(notes, pending);

      expect(result[0].id).toBe('n1');
      expect(result[1].id).toBe('p1');
    });
  });

  describe('edge cases', () => {
    it('handles empty arrays for both inputs', () => {
      const result = useNoteTimeline([], []);
      expect(result).toEqual([]);
    });

    it('handles notes with null fileId (no dedup collision)', () => {
      const notes = [makeNote({ fileId: null })];
      const pending = [makePending({ fileId: undefined, status: 'uploading' })];

      const result = useNoteTimeline(notes, pending);
      // null fileId in persisted set won't match undefined pending fileId
      expect(result).toHaveLength(2);
    });
  });
});
