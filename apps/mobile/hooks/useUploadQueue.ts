/**
 * React subscription to the singleton upload queue.
 *
 * Wraps `getUploadQueue()` in `useSyncExternalStore` so any component
 * can render counts / a list of in-flight jobs and re-render whenever
 * the queue's state changes (job added, progressed, failed, retried,
 * cancelled, completed). The job array is cached and only refreshed
 * when the queue notifies subscribers — without this, `getJobs()`'s
 * fresh-array-per-call would trigger the React "getSnapshot should be
 * cached" error and render-loop.
 *
 * Used by:
 *   - the PR-8 upload-tray UI (badge in the tab bar + retry chips)
 *   - any future consumer that needs to react to upload-queue activity
 *     without reaching into the queue singleton directly
 */
import { useCallback, useMemo, useRef, useSyncExternalStore } from "react";
import {
  getUploadQueue,
  isTerminal,
  type UploadJob,
  type UploadQueue,
} from "@/lib/uploads";

export interface UseUploadQueueOptions {
  /** Inject a queue (tests). Defaults to the singleton. */
  queue?: UploadQueue;
}

export interface UploadQueueSnapshot {
  /** Every known job, in insertion order (newest last). */
  jobs: UploadJob[];
  /** Count of jobs in pending / preprocessing / uploading. */
  activeCount: number;
  /** Count of jobs whose terminal state is `failed` (retryable). */
  failedCount: number;
  /** True if at least one job is in-flight. */
  hasActive: boolean;
  /**
   * Mean byte progress across active jobs (0..1). Returns 0 when there
   * are no active jobs, or when active jobs exist but none have
   * reported progress yet.
   */
  aggregateProgress: number;
}

/** Live snapshot of the singleton upload queue. */
export function useUploadQueue(
  opts: UseUploadQueueOptions = {},
): UploadQueueSnapshot {
  const queue = opts.queue ?? getUploadQueue();
  // Cache the jobs array between notifications. `queue.getJobs()`
  // builds a fresh array each call, which would defeat React's
  // referential-equality bail-out in useSyncExternalStore.
  const cacheRef = useRef<UploadJob[] | null>(null);

  const getSnapshot = useCallback((): UploadJob[] => {
    if (cacheRef.current === null) cacheRef.current = queue.getJobs();
    return cacheRef.current;
  }, [queue]);

  const subscribe = useCallback(
    (listener: () => void): (() => void) => {
      return queue.subscribe(() => {
        cacheRef.current = queue.getJobs();
        listener();
      });
    },
    [queue],
  );

  const jobs = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return useMemo(() => deriveSnapshot(jobs), [jobs]);
}

/** Pure derivation — exported so tests don't need React. */
export function deriveSnapshot(jobs: UploadJob[]): UploadQueueSnapshot {
  let activeCount = 0;
  let failedCount = 0;
  let progressSum = 0;
  let progressDenom = 0;
  for (const job of jobs) {
    if (job.state === "failed") {
      failedCount += 1;
      continue;
    }
    if (!isTerminal(job.state)) {
      activeCount += 1;
      progressSum += job.progress ?? 0;
      progressDenom += 1;
    }
  }
  const aggregateProgress =
    progressDenom === 0 ? 0 : progressSum / progressDenom;
  return {
    jobs,
    activeCount,
    failedCount,
    hasActive: activeCount > 0,
    aggregateProgress,
  };
}
