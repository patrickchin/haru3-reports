/**
 * Outbox helpers — durable queue of pending mutations to push to the
 * server. The outbox is the single source of truth for "this local
 * change has not yet been confirmed by the server."
 *
 * Coalescing rule (Phase 2 v1):
 *   - Consecutive UPDATEs to the same (entity, entity_id) collapse into a
 *     single outbox row whose `payload_json` carries the latest field
 *     values. Coalescing is only allowed while the existing row has not
 *     yet been attempted (`attempts = 0`); once the engine has tried it,
 *     we leave the in-flight row alone and append a new one to preserve
 *     ordering.
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

  // DELETE supersedes everything. Wipe queued non-attempted rows.
  if (p.op === "delete") {
    const inFlight = existing.filter((r) => r.attempts > 0);
    if (inFlight.length === 0) {
      // Erase any queued INSERT/UPDATEs and append a single DELETE.
      await p.tx.exec(
        `DELETE FROM outbox WHERE entity = ? AND entity_id = ? AND attempts = 0`,
        [p.entity, p.entityId],
      );
    }
    await insertRow(p);
    return;
  }

  // Coalesce with a non-attempted prior row (INSERT or UPDATE) for the
  // same entity. The latest field values overwrite earlier ones.
  const coalescable = existing.find(
    (r) => r.attempts === 0 && r.op !== "delete",
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
     WHERE next_attempt_at <= ?
     ORDER BY entity, entity_id, id
     LIMIT ?`,
    [now, limit],
  );
}

export async function deleteRow(db: SqlExecutor, id: number): Promise<void> {
  await db.exec("DELETE FROM outbox WHERE id = ?", [id]);
}

export async function bumpAttempt(
  db: SqlExecutor,
  id: number,
  nextAttemptAt: string,
  error: string,
): Promise<void> {
  await db.exec(
    `UPDATE outbox
     SET attempts = attempts + 1,
         next_attempt_at = ?,
         last_error = ?
     WHERE id = ?`,
    [nextAttemptAt, error, id],
  );
}
