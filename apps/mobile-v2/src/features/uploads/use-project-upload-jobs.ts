/**
 * React hook: subscribe to all upload jobs for a given project.
 *
 * Returns jobs in insertion order (oldest first). Filters for non-terminal
 * jobs by default (pending, preprocessing, uploading, failed). Pass
 * includeTerminal=true to also see uploaded/cancelled.
 */
import { useSyncExternalStore } from "react";
import { getUploadQueue } from "./queue";
import { isTerminal, type UploadJob } from "./jobs";

export function useProjectUploadJobs(
  projectId: string | undefined,
  opts: { includeTerminal?: boolean } = {},
): UploadJob[] {
  const queue = getUploadQueue();

  return useSyncExternalStore(
    queue.subscribe,
    () => {
      if (!projectId) return [];
      const all = queue.getJobs();
      return all.filter((job) => {
        if (job.input.projectId !== projectId) return false;
        if (opts.includeTerminal) return true;
        return !isTerminal(job.state);
      });
    },
    () => [],
  );
}
