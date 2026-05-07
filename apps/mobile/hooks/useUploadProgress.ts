/**
 * Subscribe to a single upload job by id.
 *
 * Returns `undefined` until the job exists in the queue (e.g. between
 * a call to `enqueueUpload` and the first React render).
 */
import { useMemo, useSyncExternalStore } from "react";
import { getUploadQueue, type UploadJob, type UploadQueue } from "@/lib/uploads";

export interface UseUploadProgressOptions {
  queue?: UploadQueue;
}

export function useUploadProgress(
  jobId: string | null | undefined,
  opts: UseUploadProgressOptions = {},
): UploadJob | undefined {
  const queue = opts.queue ?? getUploadQueue();

  const subscribe = useMemo(
    () => (listener: () => void) => queue.subscribe(listener),
    [queue],
  );

  const getSnapshot = useMemo(
    () => () => (jobId ? queue.getJob(jobId) : undefined),
    [queue, jobId],
  );

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
