/**
 * Push engine — drains the outbox by calling server-side
 * `apply_<entity>_mutation` RPCs.
 *
 * Decoupled from Supabase via a `MutationCaller` interface so unit tests
 * use a fake. Production wires it to `supabase.rpc(`apply_${entity}_mutation`, …)`.
 *
 * Per outbox row, the result drives a local state transition:
 *   - applied / duplicate → mark synced, bump server_updated_at, drop row.
 *   - conflict           → drop row, mark local as conflict, stash server
 *                          snapshot for the resolver UI.
 *   - forbidden          → drop row, log; the user can no longer mutate
 *                          this entity (RLS denied).
 *   - network/transient  → bump attempt with backoff; preserve ordering
 *                          by stopping on the first failure.
 *
 * Sequential processing (no parallel groups) — simpler, sufficient for
 * v1. Parallelism can be added later behind the same interface.
 */
import {
  bumpAttempt,
  deleteRow,
  markInFlight,
  markPermanentlyFailed,
  pickReady,
  resetStaleInFlight,
  type OutboxRow,
} from "./outbox";
import {
  isPermanentFailure,
  nextAttemptDelaySeconds,
  type Random,
} from "./backoff";
import type { SqlExecutor, SqlParam } from "../local-db/sql-executor";

export type MutationStatus =
  | "applied"
  | "duplicate"
  | "conflict"
  | "forbidden";

export type MutationResponse = {
  status: MutationStatus;
  server_version: string;
  row: Record<string, unknown> | null;
};

/**
 * Calls the server-side apply RPC. Throws on transport / 5xx errors so
 * the engine can apply backoff. Should NOT throw for `conflict` /
 * `forbidden` — those are returned in the response payload.
 */
export type MutationCaller = (
  entity: OutboxRow["entity"],
  payload: {
    client_op_id: string;
    op: OutboxRow["op"];
    id: string;
    base_version: string | null;
    fields: Record<string, unknown>;
  },
) => Promise<MutationResponse>;

export type DrainResult = {
  applied: number;
  duplicates: number;
  conflicts: number;
  forbidden: number;
  retried: number;
  permanentlyFailed: number;
};

export type DrainArgs = {
  db: SqlExecutor;
  caller: MutationCaller;
  now: () => string;
  /** Override RNG for deterministic backoff in tests. */
  random?: Random;
  /** Max rows to attempt per call. Default 32. */
  limit?: number;
};

export async function drainOutbox(args: DrainArgs): Promise<DrainResult> {
  const limit = args.limit ?? 32;
  const result: DrainResult = {
    applied: 0,
    duplicates: 0,
    conflicts: 0,
    forbidden: 0,
    retried: 0,
    permanentlyFailed: 0,
  };

  // Recover from a prior crash mid-push. Any row stranded `in_flight`
  // gets requeued; replays are safe because the server caches responses
  // by `client_op_id`.
  await resetStaleInFlight(args.db);

  const ready = await pickReady(args.db, args.now(), limit);

  // Track which (entity, entity_id) pairs have failed this drain so we
  // skip later ops for the same row (preserve per-row ordering).
  const failedRows = new Set<string>();

  for (const row of ready) {
    const key = `${row.entity}:${row.entity_id}`;
    if (failedRows.has(key)) continue;

    // Mark `in_flight` BEFORE the RPC so concurrent `enqueue` calls do
    // not coalesce a new payload into this row's `client_op_id`.
    await markInFlight(args.db, row.id);

    try {
      const response = await args.caller(row.entity, {
        client_op_id: row.client_op_id,
        op: row.op,
        id: row.entity_id,
        base_version: row.base_version,
        fields: JSON.parse(row.payload_json) as Record<string, unknown>,
      });

      switch (response.status) {
        case "applied":
        case "duplicate":
          await onApplied(args.db, row, response);
          if (response.status === "applied") result.applied += 1;
          else result.duplicates += 1;
          break;
        case "conflict":
          await onConflict(args.db, row, response);
          result.conflicts += 1;
          break;
        case "forbidden":
          await deleteRow(args.db, row.id);
          result.forbidden += 1;
          break;
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      const attemptsBefore = row.attempts;
      if (isPermanentFailure(attemptsBefore + 1)) {
        // Burn out — park the row so it's never picked again. The user
        // can inspect / retry via the debug screen.
        await markPermanentlyFailed(args.db, row.id, `permanent: ${error}`);
        result.permanentlyFailed += 1;
      } else {
        const delay = nextAttemptDelaySeconds(attemptsBefore, args.random);
        const next = addSeconds(args.now(), delay);
        await bumpAttempt(args.db, row.id, next, error);
        result.retried += 1;
      }
      failedRows.add(key);
    }
  }

  return result;
}

async function onApplied(
  db: SqlExecutor,
  row: OutboxRow,
  response: MutationResponse,
): Promise<void> {
  await db.transaction(async (tx) => {
    if (row.op === "delete") {
      // Server confirmed the soft-delete. Local already has deleted_at set.
      await tx.exec(
        `UPDATE ${tableNameFor(row.entity)}
         SET server_updated_at = ?, sync_state = 'synced'
         WHERE id = ?`,
        [response.server_version, row.entity_id],
      );
    } else {
      await tx.exec(
        `UPDATE ${tableNameFor(row.entity)}
         SET server_updated_at = ?, sync_state = 'synced'
         WHERE id = ?`,
        [response.server_version, row.entity_id],
      );
    }
    await tx.exec("DELETE FROM outbox WHERE id = ?", [row.id]);
  });
}

async function onConflict(
  db: SqlExecutor,
  row: OutboxRow,
  response: MutationResponse,
): Promise<void> {
  await db.transaction(async (tx) => {
    if (row.entity === "report" && response.row) {
      // Stash the server's row under the dedicated sibling column.
      // report_data_json stays user content; conflict metadata lives
      // in conflict_snapshot_json. The resolver UI reads from there.
      const snapshotJson = JSON.stringify(response.row);
      await tx.exec(
        `UPDATE reports
         SET sync_state = 'conflict',
             generation_error = NULL,
             conflict_snapshot_json = ?
         WHERE id = ?`,
        [snapshotJson, row.entity_id],
      );
    } else {
      await tx.exec(
        `UPDATE ${tableNameFor(row.entity)}
         SET sync_state = 'conflict'
         WHERE id = ?`,
        [row.entity_id],
      );
    }
    await tx.exec("DELETE FROM outbox WHERE id = ?", [row.id]);
  });
}

function tableNameFor(entity: OutboxRow["entity"]): string {
  switch (entity) {
    case "project": return "projects";
    case "report": return "reports";
    case "file_metadata": return "file_metadata";
  }
}

function addSeconds(iso: string, seconds: number): string {
  return new Date(new Date(iso).getTime() + seconds * 1000).toISOString();
}

// Re-export to keep test imports tidy.
export type { SqlParam };
