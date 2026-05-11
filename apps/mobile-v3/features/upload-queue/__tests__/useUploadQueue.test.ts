import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { UploadJob } from '../UploadQueueProvider';

// ---------------------------------------------------------------------------
// Mock @legendapp/state/react — `use$` returns the `.get()` of the observable
// ---------------------------------------------------------------------------

let mockJobs: UploadJob[] = [];

vi.mock('../UploadQueueProvider', () => ({
  uploadQueue$: {
    jobs: { get: () => mockJobs },
  },
}));

vi.mock('@legendapp/state/react', () => ({
  use$: (obs: { get: () => unknown }) => obs.get(),
}));

const { useUploadQueue } = await import('../useUploadQueue');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeJob(overrides: Partial<UploadJob> = {}): UploadJob {
  return {
    id: 'j1',
    status: 'pending',
    fileUri: 'file:///tmp/a.jpg',
    fileName: 'a.jpg',
    mimeType: 'image/jpeg',
    sizeBytes: 1024,
    category: 'image',
    reportId: 'r1',
    projectId: 'p1',
    progress: 0,
    retryCount: 0,
    addedAt: Date.now(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useUploadQueue', () => {
  beforeEach(() => {
    mockJobs = [];
  });

  it('returns empty arrays when no jobs', () => {
    const state = useUploadQueue();
    expect(state.jobs).toEqual([]);
    expect(state.pending).toEqual([]);
    expect(state.uploading).toEqual([]);
    expect(state.completed).toEqual([]);
    expect(state.failed).toEqual([]);
    expect(state.pendingCount).toBe(0);
    expect(state.failedCount).toBe(0);
  });

  it('filters jobs by status correctly', () => {
    mockJobs = [
      makeJob({ id: 'j1', status: 'pending' }),
      makeJob({ id: 'j2', status: 'uploading' }),
      makeJob({ id: 'j3', status: 'completed' }),
      makeJob({ id: 'j4', status: 'failed' }),
      makeJob({ id: 'j5', status: 'pending' }),
    ];

    const state = useUploadQueue();

    expect(state.pending.map((j) => j.id)).toEqual(['j1', 'j5']);
    expect(state.uploading.map((j) => j.id)).toEqual(['j2']);
    expect(state.completed.map((j) => j.id)).toEqual(['j3']);
    expect(state.failed.map((j) => j.id)).toEqual(['j4']);
  });

  it('pendingCount and failedCount reflect filtered arrays', () => {
    mockJobs = [
      makeJob({ id: 'j1', status: 'pending' }),
      makeJob({ id: 'j2', status: 'pending' }),
      makeJob({ id: 'j3', status: 'failed' }),
    ];

    const state = useUploadQueue();

    expect(state.pendingCount).toBe(2);
    expect(state.failedCount).toBe(1);
  });

  it('jobs array includes all jobs regardless of status', () => {
    mockJobs = [
      makeJob({ id: 'j1', status: 'pending' }),
      makeJob({ id: 'j2', status: 'completed' }),
    ];

    const state = useUploadQueue();
    expect(state.jobs).toHaveLength(2);
  });
});
