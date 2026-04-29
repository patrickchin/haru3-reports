/**
 * Generation driver — pulls due rows from `generation_jobs` and runs
 * them through the `GenerationWorker` one at a time.
 *
 * One pass = one job. Triggers (NetInfo reconnect, AppState→active,
 * 60-second tick, manual button) live in `SyncProvider` and call
 * `runGenerationOnce` per tick. The driver is single-flight at the
 * pass level so concurrent triggers do not double-pick.
 *
 * Outcome handling:
 *   - worker returns `ran` (ok)         → markCompleted
 *   - worker returns `ran` (!ok)        → reschedule with backoff
 *   - worker returns `deferred`         → reschedule with backoff
 *                                          (the gate may be green next tick)
 *   - worker returns `skipped`          → markFailed (terminal — the
 *                                          report is gone or a manual
 *                                          run is required)
 *   - generate() throws                  → reschedule with backoff,
 *                                          permanent after MAX_ATTEMPTS
 *
 * The driver does NOT write the generated report back into the
 * `reports` row itself — that's `generate`'s job (it has the payload).
 * Keeping the driver narrow keeps it dependency-free.
 */
import type { SqlExecutor } from "../local-db/sql-executor";
import {
  isPermanentFailure,
  nextAttemptDelaySeconds,
  type Random,
} from "./backoff";
import {
  claimNextReady,
  markCompleted,
  markFailed,
  rescheduleAfterTransient,
  resetStaleRunning,
  type GenerationJobRow,
} from "./generation-jobs-repo";
import type { GenerationWorker, RunResult } from "./generation-worker";

export type GenerationDriverDeps = {
  db: SqlExecutor;
  worker: GenerationWorker;
  /** ISO-8601 wall clock; injected for tests. */
  now: () => string;
  /** Math.random override for deterministic jitter. */
  random?: Random;
  /** Fired for each processed row; useful for sync_events / metrics. */
  onResult?: (row: GenerationJobRow, result: DriverOutcome) => void;
};

export type DriverOutcome =
  | { kind: "completed" }
  | { kind: "deferred"; reason: string; nextAttemptAt: string }
  | { kind: "rescheduled"; error: string; nextAttemptAt: string }
  | { kind: "failed"; error: string }
  | { kind: "idle" };

let driverPassInFlight = false;

/**
 * Run a single pass: claim one due job and process it. Returns `idle`
 * when nothing is due. Re-entrant calls are coalesced — a second
 * caller while the first is in flight gets `idle` immediately to keep
 * the trigger surface idempotent.
 */
export async function runGenerationOnce(
  deps: GenerationDriverDeps,
): Promise<DriverOutcome> {
  if (driverPassInFlight) return { kind: "idle" };
  driverPassInFlight = true;
  try {
    const now = deps.now();
    await resetStaleRunning(deps.db);
    const job = await claimNextReady(deps.db, now);
    if (!job) return { kind: "idle" };
    const outcome = await processJob(job, deps);
    deps.onResult?.(job, outcome);
    return outcome;
  } finally {
    driverPassInFlight = false;
  }
}

async function processJob(
  job: GenerationJobRow,
  deps: GenerationDriverDeps,
): Promise<DriverOutcome> {
  let result: RunResult;
  try {
    result = await deps.worker.runIfReady(job.report_id);
  } catch (err) {
    return await scheduleRetry(job, deps, errorMessage(err));
  }

  switch (result.kind) {
    case "ran":
      if (result.ok) {
        await markCompleted(deps.db, job.id, deps.now());
        return { kind: "completed" };
      }
      return await scheduleRetry(job, deps, "generate returned ok=false");

    case "deferred": {
      const nextAttemptAt = computeNextAttemptAt(job.attempts, deps);
      await rescheduleAfterTransient(
        deps.db,
        job.id,
        nextAttemptAt,
        `deferred:${result.reason}`,
      );
      return { kind: "deferred", reason: result.reason, nextAttemptAt };
    }

    case "skipped": {
      // 'no-such-report' and 'policy-needs-user' are terminal as far as
      // an automated retry is concerned — the user must act (or the
      // report is gone). 'already-running' is transient.
      if (result.reason === "already-running") {
        const nextAttemptAt = computeNextAttemptAt(job.attempts, deps);
        await rescheduleAfterTransient(
          deps.db,
          job.id,
          nextAttemptAt,
          "skipped:already-running",
        );
        return {
          kind: "rescheduled",
          error: "skipped:already-running",
          nextAttemptAt,
        };
      }
      const error = `skipped:${result.reason}`;
      await markFailed(deps.db, job.id, error);
      return { kind: "failed", error };
    }
  }
}

async function scheduleRetry(
  job: GenerationJobRow,
  deps: GenerationDriverDeps,
  error: string,
): Promise<DriverOutcome> {
  const nextAttempts = job.attempts + 1;
  if (isPermanentFailure(nextAttempts)) {
    await markFailed(deps.db, job.id, error);
    return { kind: "failed", error };
  }
  const nextAttemptAt = computeNextAttemptAt(job.attempts, deps);
  await rescheduleAfterTransient(deps.db, job.id, nextAttemptAt, error);
  return { kind: "rescheduled", error, nextAttemptAt };
}

function computeNextAttemptAt(
  attemptsBefore: number,
  deps: GenerationDriverDeps,
): string {
  const seconds = nextAttemptDelaySeconds(attemptsBefore, deps.random);
  return new Date(Date.parse(deps.now()) + seconds * 1000).toISOString();
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/** Test helper — only call from tests. */
export function _resetDriverInFlight(): void {
  driverPassInFlight = false;
}
