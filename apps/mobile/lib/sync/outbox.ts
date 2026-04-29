/**
 * Outbox helpers — durable queue of pending mutations to push to the
 * server. The outbox is the single source of truth for "this local
 * change has not yet been confirmed by the server."
 *
 * Coalescing rule (v2):
 *   - Consecutive UPDATEs to the same (entity, entity_id) collapse into a
 *     single outbox row whose `payload_json` carries the latest field
 *     values. Coalescing is only allowed while the existing row is
 *     `state = 'queued'` AND `attempts = 0`. Once the engine has marked
 *     it `in_flight` (or it has been retried after a failure), we leave
 *     the prior row alone and append a new one to preserve ordering and
 *     to avoid replaying a `client_op_id` with mutated payload (the
 *     server caches responses by `client_op_id` and would return a stale
 *     'duplicate', silently losing the new fields).
 *   - INSERT followed by UPDATE → UPSERT semantics: the UPDATE is folded
 *     into the INSERT's payload (still INSERT op).
 *   - Any op followed by DELETE supersedes prior queued ops for that row.
 *     We delete the prior pending rows and enqueue a single DELETE.
 *
 * All mutations go through `enqueue` inside an existing transaction
 * supplied by the caller — the local row write and the outbox enqueue
 * MUST be atomic.
 */
import type { IdGen } from "../local-db/clock";
import type { SqlExecutor } from "../local-db/sql-executor";

export type OutboxEntity = "project" | "report" | "file_metadata";
export type OutboxOp = "insert" | "update" | "delete";
export type OutboxState = "queued" | "in_flight" | "permanent_failed";

export type OutboxPayload = Record<string, unknown>;

export type OutboxRow = {
  id: number;
  entity: OutboxEntity;
  entity_id: string;
  op: OutboxOp;
  payload_json: string;
  base_version: string | null;
  attempts: number;
  next_attempt_at: string;
  last_error: string | null;
  client_op_id: string;
  created_at: string;
  state: OutboxState;
};

export type EnqueueParams = {
  tx: SqlExecutor;
  entity: OutboxEntity;
  entityId: string;
  op: OutboxOp;
  payload: OutboxPayload;
  baseVersion: string | null;
  now: string;
  newId: IdGen;
};

export async function enqueue(p: EnqueueParams): Promise<void> {
  const existing = await p.tx.all<OutboxRow>(
    `SELECT * FROM outbox
     WHERE entity = ? AND entity_id = ?
     ORDER BY id ASC`,
    [p.entity, p.entityId],
  );

  // DELETE supersedes everything. Wipe queued, never-attempted rows;
  // anything `in_flight` or already retried must be preserved so the
  // server sees the original op-then-delete sequence.
  if (p.op === "delete") {
    const blocking = existing.filter(
      (r) => r.state !== "queued" || r.attempts > 0,
    );
    if (blocking.length === 0) {
      // Erase any queued INSERT/UPDATEs and append a single DELETE.
      await p.tx.exec(
        `DELETE FROM outbox
         WHERE entity = ? AND entity_id = ? AND state = 'queued' AND attempts = 0`,
        [p.entity, p.entityId],
      );
    }
    await insertRow(p);
    return;
  }

  // Coalesce with a queued, never-attempted prior row (INSERT or UPDATE)
  // for the same entity. The latest field values overwrite earlier ones.
  // We require BOTH state='queued' AND attempts=0 — once a row has been
  // attempted we cannot reuse its client_op_id for a different payload.
  const coalescable = existing.find(
    (r) =>
      r.state === "queued" && r.attempts === 0 && r.op !== "delete",
  );
  if (coalescable) {
    const merged = mergePayloads(
      JSON.parse(coalescable.payload_json) as OutboxPayload,
      p.payload,
    );
    // If we have an existing INSERT and now an UPDATE arrives, keep op=insert
    // so the server still creates the row. Otherwise keep coalescable.op.
    const op: OutboxOp = coalescable.op;
    await p.tx.exec(
      `UPDATE outbox SET payload_json = ?, base_version = COALESCE(base_version, ?),
         next_attempt_at = ?, op = ?
       WHERE id = ?`,
      [JSON.stringify(merged), p.baseVersion, p.now, op, coalescable.id],
    );
    return;
  }

  await insertRow(p);
}

async function insertRow(p: EnqueueParams): Promise<void> {
  await p.tx.exec(
    `INSERT INTO outbox (
       entity, entity_id, op, payload_json, base_version,
       attempts, next_attempt_at, client_op_id, created_at
     ) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)`,
    [
      p.entity,
      p.entityId,
      p.op,
      JSON.stringify(p.payload),
      p.baseVersion,
      p.now,
      p.newId(),
      p.now,
    ],
  );
}

function mergePayloads(
  prior: OutboxPayload,
  next: OutboxPayload,
): OutboxPayload {
  // Shallow merge — payloads are partial field bags; later writes win.
  return { ...prior, ...next };
}

// ---------------------------------------------------------------------------
// Drain helpers (used by the push engine)
// ---------------------------------------------------------------------------

export async function pickReady(
  db: SqlExecutor,
  now: string,
  limit: number,
): Promise<OutboxRow[]> {
  return db.all<OutboxRow>(
    `SELECT * FROM outbox
     WHERE state = 'queued' AND next_attempt_at <= ?
     ORDER BY entity, entity_id, id
     LIMIT ?`,
    [now, limit],
  );
}

export async function deleteRow(db: SqlExecutor, id: number): Promise<void> {
  await db.exec("DELETE FROM outbox WHERE id = ?", [id]);
}

/**
 * Mark a row as currently being pushed. Concurrent `enqueue` calls will
 * not coalesce into an `in_flight` row — they append a new one.
 */
export async function markInFlight(
  db: SqlExecutor,
  id: number,
): Promise<void> {
  await db.exec("UPDATE outbox SET state = 'in_flight' WHERE id = ?", [id]);
}

/**
 * Reset rows stranded in `in_flight` (e.g. app crashed mid-push) back to
 * `queued`. Safe because the server is idempotent via `client_op_id`:
 * a replay returns the cached response (`status: 'duplicate'`).
 */
export async function resetStaleInFlight(db: SqlExecutor): Promise<number> {
  const before = await db.get<{ n: number }>(
    "SELECT count(*) AS n FROM outbox WHERE state = 'in_flight'",
  );
  await db.exec("UPDATE outbox SET state = 'queued' WHERE state = 'in_flight'");
  return before?.n ?? 0;
}

export async function bumpAttempt(
  db: SqlExecutor,
  id: number,
  nextAttemptAt: string,
  error: string,
): Promise<void> {
  // Reset state to 'queued' so pickReady can re-pick once the backoff
  // delay has elapsed.
  await db.exec(
    `UPDATE outbox
     SET attempts = attempts + 1,
         next_attempt_at = ?,
         last_error = ?,
         state = 'queued'
     WHERE id = ?`,
    [nextAttemptAt, error, id],
  );
}

/**
 * Park a row permanently after exceeding `MAX_ATTEMPTS`. The row is
 * preserved for inspection but never picked again.
 */
export async function markPermanentlyFailed(
  db: SqlExecutor,
  id: number,
  error: string,
): Promise<void> {
  await db.exec(
    `UPDATE outbox
     SET attempts = attempts + 1,
         last_error = ?,
         state = 'permanent_failed'
     WHERE id = ?`,
    [error, id],
  );
}
