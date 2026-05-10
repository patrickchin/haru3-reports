import { use$ } from '@legendapp/state/react';
import { uploadQueue$ } from './UploadQueueProvider';
import type { UploadJob } from './UploadQueueProvider';

export interface UploadQueueState {
  jobs: UploadJob[];
  pending: UploadJob[];
  uploading: UploadJob[];
  completed: UploadJob[];
  failed: UploadJob[];
  pendingCount: number;
  failedCount: number;
}

export function useUploadQueue(): UploadQueueState {
  const jobs = use$(uploadQueue$.jobs);

  const pending = jobs.filter((j) => j.status === 'pending');
  const uploading = jobs.filter((j) => j.status === 'uploading');
  const completed = jobs.filter((j) => j.status === 'completed');
  const failed = jobs.filter((j) => j.status === 'failed');

  return {
    jobs,
    pending,
    uploading,
    completed,
    failed,
    pendingCount: pending.length,
    failedCount: failed.length,
  };
}
