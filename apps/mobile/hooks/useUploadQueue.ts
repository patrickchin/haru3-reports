/**
 * React binding for the upload queue.
 *
 * Wraps `useSyncExternalStore` so any screen can render a live list of
 * upload jobs without managing subscriptions by hand. Optionally
 * filters by projectId so a project view only sees its own jobs.
 */
import { useMemo, useRef, useSyncExternalStore } from "react";
import { getUploadQueue, type UploadJob, type UploadQueue } from "@/lib/uploads";

export interface UseUploadQueueOptions {
  /** When set, only jobs matching this projectId are returned. */
  projectId?: string;
  /** When set, only jobs matching this reportId are returned. */
  reportId?: string;
  /** Inject a queue (test seam). Defaults to the app singleton. */
  queue?: UploadQueue;
}

export function useUploadQueue(opts: UseUploadQueueOptions = {}): UploadJob[] {
  const queue = opts.queue ?? getUploadQueue();

  // Cache the snapshot — useSyncExternalStore requires the same array
  // reference between renders when nothing changed, otherwise React 18+
  // throws "getSnapshot should be cached".
  const cached = useRef<UploadJob[]>([]);

  const subscribe = useMemo(
    () => (listener: () => void) => queue.subscribe(listener),
    [queue],
  );

  const getSnapshot = useMemo(() => {
    return () => {
      const next = queue.getJobs();
      const prev = cached.current;
      if (snapshotsEqual(prev, next)) return prev;
      cached.current = next;
      return next;
    };
  }, [queue]);

  const all = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  return useMemo(() => {
    if (!opts.projectId && !opts.reportId) return all;
    return all.filter((j) => {
      if (opts.projectId && j.input.projectId !== opts.projectId) return false;
      if (opts.reportId && j.input.reportId !== opts.reportId) return false;
      return true;
    });
  }, [all, opts.projectId, opts.reportId]);
}

function snapshotsEqual(a: UploadJob[], b: UploadJob[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!;
    const y = b[i]!;
    if (
      x.id !== y.id ||
      x.state !== y.state ||
      x.progress !== y.progress ||
      x.attempts !== y.attempts ||
      x.updatedAt !== y.updatedAt
    ) {
      return false;
    }
  }
  return true;
}
