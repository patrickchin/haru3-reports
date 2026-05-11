import { describe, it, expect, vi, beforeEach } from 'vitest';
import { observable } from '@legendapp/state';

// ---------------------------------------------------------------------------
// Mock transitive deps so importing UploadQueueProvider doesn't blow up
// ---------------------------------------------------------------------------

vi.mock('@/lib/api/client', () => ({
  supabase: { auth: {} },
  api: {},
}));

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() },
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: vi.fn(() => ({ invalidateQueries: vi.fn() })),
}));

vi.mock('@/lib/api/hooks', () => ({
  usePresignUpload: vi.fn(() => ({ mutateAsync: vi.fn() })),
  useCreateFile: vi.fn(() => ({ mutateAsync: vi.fn() })),
}));

vi.mock('@/lib/api/keys', () => ({
  keys: { files: { list: vi.fn() } },
}));

import { uploadQueue$, type UploadJob } from '../UploadQueueProvider';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeJob(overrides: Partial<UploadJob> = {}): UploadJob {
  return {
    id: `j_${Math.random().toString(36).slice(2, 6)}`,
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

/** Replicate the updateJob helper from the provider */
function updateJob(id: string, patch: Partial<UploadJob>) {
  uploadQueue$.jobs.set(
    uploadQueue$.jobs.get().map((j) => (j.id === id ? { ...j, ...patch } : j)),
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('UploadQueue state machine', () => {
  beforeEach(() => {
    uploadQueue$.jobs.set([]);
  });

  // ---- Adding jobs --------------------------------------------------------

  it('starts with empty jobs', () => {
    expect(uploadQueue$.jobs.get()).toEqual([]);
  });

  it('can add a job to the queue', () => {
    const job = makeJob({ id: 'j1' });
    uploadQueue$.jobs.set([...uploadQueue$.jobs.get(), job]);

    expect(uploadQueue$.jobs.get()).toHaveLength(1);
    expect(uploadQueue$.jobs.get()[0].id).toBe('j1');
    expect(uploadQueue$.jobs.get()[0].status).toBe('pending');
  });

  it('can add multiple jobs', () => {
    uploadQueue$.jobs.set([makeJob({ id: 'j1' }), makeJob({ id: 'j2' })]);
    expect(uploadQueue$.jobs.get()).toHaveLength(2);
  });

  // ---- Job lifecycle: pending → uploading → completed ---------------------

  it('transitions pending → uploading → completed', () => {
    uploadQueue$.jobs.set([makeJob({ id: 'j1', status: 'pending' })]);

    updateJob('j1', { status: 'uploading', progress: 0 });
    expect(uploadQueue$.jobs.get()[0].status).toBe('uploading');

    updateJob('j1', { progress: 50 });
    expect(uploadQueue$.jobs.get()[0].progress).toBe(50);

    updateJob('j1', { status: 'completed', progress: 100, fileId: 'f1', storagePath: '/path' });
    const final = uploadQueue$.jobs.get()[0];
    expect(final.status).toBe('completed');
    expect(final.progress).toBe(100);
    expect(final.fileId).toBe('f1');
  });

  // ---- Job lifecycle: pending → uploading → failed ------------------------

  it('transitions pending → uploading → retryable failure', () => {
    uploadQueue$.jobs.set([makeJob({ id: 'j1', status: 'pending' })]);

    updateJob('j1', { status: 'uploading', progress: 0 });
    expect(uploadQueue$.jobs.get()[0].status).toBe('uploading');

    // retryCount < MAX_RETRIES → back to pending
    updateJob('j1', { status: 'pending', retryCount: 1, lastError: 'Network error', progress: 0 });
    const retried = uploadQueue$.jobs.get()[0];
    expect(retried.status).toBe('pending');
    expect(retried.retryCount).toBe(1);
    expect(retried.lastError).toBe('Network error');
  });

  // ---- Retry increments retry count ---------------------------------------

  it('increments retry count on each failure', () => {
    uploadQueue$.jobs.set([makeJob({ id: 'j1', retryCount: 0 })]);

    updateJob('j1', { retryCount: 1, status: 'pending', lastError: 'err1' });
    expect(uploadQueue$.jobs.get()[0].retryCount).toBe(1);

    updateJob('j1', { retryCount: 2, status: 'pending', lastError: 'err2' });
    expect(uploadQueue$.jobs.get()[0].retryCount).toBe(2);
  });

  // ---- Max retries → failed -----------------------------------------------

  it('marks job as failed when retryCount reaches MAX_RETRIES (3)', () => {
    const MAX_RETRIES = 3;
    uploadQueue$.jobs.set([makeJob({ id: 'j1', retryCount: 0 })]);

    for (let i = 0; i < MAX_RETRIES; i++) {
      const current = uploadQueue$.jobs.get()[0];
      const rc = current.retryCount + 1;
      updateJob('j1', {
        status: rc >= MAX_RETRIES ? 'failed' : 'pending',
        retryCount: rc,
        lastError: 'err',
      });
    }

    expect(uploadQueue$.jobs.get()[0].status).toBe('failed');
    expect(uploadQueue$.jobs.get()[0].retryCount).toBe(3);
  });

  // ---- Cancel (remove) ----------------------------------------------------

  it('cancel removes a job from the queue', () => {
    uploadQueue$.jobs.set([makeJob({ id: 'j1' }), makeJob({ id: 'j2' })]);
    uploadQueue$.jobs.set(uploadQueue$.jobs.get().filter((j) => j.id !== 'j1'));

    expect(uploadQueue$.jobs.get()).toHaveLength(1);
    expect(uploadQueue$.jobs.get()[0].id).toBe('j2');
  });

  // ---- Remove completed ---------------------------------------------------

  it('removeCompleted filters out completed jobs', () => {
    uploadQueue$.jobs.set([
      makeJob({ id: 'j1', status: 'completed' }),
      makeJob({ id: 'j2', status: 'pending' }),
      makeJob({ id: 'j3', status: 'completed' }),
      makeJob({ id: 'j4', status: 'failed' }),
    ]);

    uploadQueue$.jobs.set(uploadQueue$.jobs.get().filter((j) => j.status !== 'completed'));

    const remaining = uploadQueue$.jobs.get();
    expect(remaining).toHaveLength(2);
    expect(remaining.map((j) => j.id)).toEqual(['j2', 'j4']);
  });

  // ---- Retry resets state --------------------------------------------------

  it('retry resets job to pending with retryCount=0', () => {
    uploadQueue$.jobs.set([makeJob({ id: 'j1', status: 'failed', retryCount: 3, lastError: 'err' })]);

    updateJob('j1', { status: 'pending', retryCount: 0, lastError: undefined, progress: 0 });

    const reset = uploadQueue$.jobs.get()[0];
    expect(reset.status).toBe('pending');
    expect(reset.retryCount).toBe(0);
    expect(reset.lastError).toBeUndefined();
    expect(reset.progress).toBe(0);
  });

  // ---- updateJob only affects target job -----------------------------------

  it('updateJob only modifies the targeted job', () => {
    uploadQueue$.jobs.set([
      makeJob({ id: 'j1', status: 'pending' }),
      makeJob({ id: 'j2', status: 'pending' }),
    ]);

    updateJob('j1', { status: 'uploading' });

    expect(uploadQueue$.jobs.get()[0].status).toBe('uploading');
    expect(uploadQueue$.jobs.get()[1].status).toBe('pending');
  });
});
