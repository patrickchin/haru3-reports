/**
 * Generation jobs repo — durable queue of deferred LLM calls.
 *
 * Mirrors the outbox shape in spirit: a job goes
 *
 *   queued (next_attempt_at <= now)
 *     ↓ claim()
 *   running
 *     ↓ markCompleted | markFailed (transient → queued w/ backoff,
 *                                    permanent → failed terminal)
 *
 * One job per report at a time is sufficient for v1. If a report is
 * edited again while a job is queued, we simply update its
 * `last_processed_note_count` and reset `next_attempt_at` rather than
 * stacking duplicates.
 */
import type { SqlExecutor } from "../local-db/sql-executor";

export type JobState = "queued" | "running" | "completed" | "failed";
export type JobMode = "auto" | "manual";

export type GenerationJobRow = {
  id: number;
  report_id: string;
  mode: JobMode;
  last_processed_note_count: number;
  state: JobState;
  attempts: number;
  next_attempt_at: string;
  error: string | null;
  created_at: string;
  completed_at: string | null;
};

export type EnqueueArgs = {
  db: SqlExecutor;
  reportId: string;
  mode: JobMode;
  lastProcessedNoteCount?: number;
  now: string;
};

/**
 * Enqueue (or refresh) a job for `reportId`.
 *
 * If a non-terminal job already exists for the report, we update its
 * `next_attempt_at` to now, bump `last_processed_note_count` to the
 * supplied value, and reset `state='queued'` (so a stuck `running` row
 * gets a chance to be re-picked after a crash). Returns the row id.
 */
export async function enqueueJob(args: EnqueueArgs): Promise<number> {
  const existing = await args.db.get<GenerationJobRow>(
    `SELECT * FROM generation_jobs
     WHERE report_id = ?
       AND state IN ('queued','running')
     ORDER BY id DESC
     LIMIT 1`,
    [args.reportId],
  );

  if (existing) {
    await args.db.exec(
      `UPDATE generation_jobs
       SET state = 'queued',
           next_attempt_at = ?,
           last_processed_note_count = ?
       WHERE id = ?`,
      [args.now, args.lastProcessedNoteCount ?? existing.last_processed_note_count, existing.id],
    );
    return existing.id;
  }

  await args.db.exec(
    `INSERT INTO generation_jobs (
       report_id, mode, last_processed_note_count,
       state, attempts, next_attempt_at, created_at
     ) VALUES (?, ?, ?, 'queued', 0, ?, ?)`,
    [
      args.reportId,
      args.mode,
      args.lastProcessedNoteCount ?? 0,
      args.now,
      args.now,
    ],
  );
  const row = await args.db.get<{ id: number }>(
    "SELECT last_insert_rowid() AS id",
  );
  return row?.id ?? 0;
}

/**
 * Pick the next due job and mark it `running` atomically. Returns null
 * if none are due.
 */
export async function claimNextReady(
  db: SqlExecutor,
  now: string,
): Promise<GenerationJobRow | null> {
  return db.transaction(async (tx) => {
    const row = await tx.get<GenerationJobRow>(
      `SELECT * FROM generation_jobs
       WHERE state = 'queued' AND next_attempt_at <= ?
       ORDER BY id ASC
       LIMIT 1`,
      [now],
    );
    if (!row) return null;
    await tx.exec(
      "UPDATE generation_jobs SET state = 'running' WHERE id = ?",
      [row.id],
    );
    return { ...row, state: "running" };
  });
}

/**
 * Reset rows stranded in `running` (app crashed mid-call) back to
 * `queued`. Called on driver startup. Safe because the edge function
 * is idempotent for the same `(notes, existingReport)` input.
 */
export async function resetStaleRunning(db: SqlExecutor): Promise<number> {
  const before = await db.get<{ n: number }>(
    "SELECT count(*) AS n FROM generation_jobs WHERE state = 'running'",
  );
  await db.exec(
    "UPDATE generation_jobs SET state = 'queued' WHERE state = 'running'",
  );
  return before?.n ?? 0;
}

export async function markCompleted(
  db: SqlExecutor,
  id: number,
  now: string,
): Promise<void> {
  await db.exec(
    `UPDATE generation_jobs
     SET state = 'completed', completed_at = ?, error = NULL
     WHERE id = ?`,
    [now, id],
  );
}

export async function markFailed(
  db: SqlExecutor,
  id: number,
  error: string,
): Promise<void> {
  await db.exec(
    `UPDATE generation_jobs
     SET state = 'failed', error = ?
     WHERE id = ?`,
    [error, id],
  );
}

/**
 * Bump attempts and reschedule. Used for transient errors (network
 * failure, 5xx) so the job is retried on the next driver tick after the
 * backoff window.
 */
export async function rescheduleAfterTransient(
  db: SqlExecutor,
  id: number,
  nextAttemptAt: string,
  error: string,
): Promise<void> {
  await db.exec(
    `UPDATE generation_jobs
     SET state = 'queued',
         attempts = attempts + 1,
         next_attempt_at = ?,
         error = ?
     WHERE id = ?`,
    [nextAttemptAt, error, id],
  );
}
