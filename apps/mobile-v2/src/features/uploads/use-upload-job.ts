/**
 * React hook: subscribe to a single upload job by ID.
 *
 * Uses `useSyncExternalStore` to safely observe the queue's mutable
 * state without tearing. Returns undefined if the job doesn't exist.
 */
import { useSyncExternalStore } from "react";
import { getUploadQueue } from "./queue";
import type { UploadJob } from "./jobs";

export function useUploadJob(jobId: string | undefined): UploadJob | undefined {
  const queue = getUploadQueue();

  return useSyncExternalStore(
    queue.subscribe,
    () => (jobId ? queue.getJob(jobId) : undefined),
    () => undefined,
  );
}
