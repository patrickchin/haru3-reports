/**
 * Conflict resolver — Phase 2 v1.
 *
 * UX is intentionally minimal per the locked decision:
 *   - "Keep mine"  → strip the stashed server snapshot, re-enqueue an
 *                    update with the server's `updated_at` as the new
 *                    `base_version`, mark local back to `dirty`. The
 *                    push engine retries against the latest server row.
 *   - "Use server" → overwrite local with the server snapshot, mark
 *                    `synced`, drop any pending outbox row for this entity.
 *
 * `_serverSnapshot` is embedded under `report_data._serverSnapshot` (see
 * push-engine.ts onConflict).
 */
import { enqueue } from "./outbox";
import type { Clock, IdGen } from "../local-db/clock";
import type { SqlExecutor } from "../local-db/sql-executor";
import { jsonDiff, type JsonDiffEntry } from "./json-diff";
import { stampReportDataSchemaVersion } from "../local-db/repositories/reports-repo";

export type ResolveDeps = {
  db: SqlExecutor;
  clock: Clock;
  newId: IdGen;
};

type ReportSnapshotPayload = {
  id?: string;
  title?: string;
  status?: string;
  visit_date?: string | null;
  confidence?: number | null;
  notes?: unknown[];
  report_data?: Record<string, unknown>;
  updated_at?: string;
};

export async function resolveReportConflict(
  deps: ResolveDeps,
  reportId: string,
  choice: "keep_mine" | "use_server",
): Promise<void> {
  const now = deps.clock();
  await deps.db.transaction(async (tx) => {
    const row = await tx.get<{
      report_data_json: string;
      title: string;
      status: string;
      visit_date: string | null;
      confidence: number | null;
      notes_json: string;
      server_updated_at: string | null;
    }>(
      `SELECT report_data_json, title, status, visit_date, confidence,
              notes_json, server_updated_at
       FROM reports WHERE id = ?`,
      [reportId],
    );
    if (!row) throw new Error(`resolveReportConflict: ${reportId} not found`);

    const data = parseObject(row.report_data_json);
    const serverSnapshot = (data._serverSnapshot ?? null) as
      | ReportSnapshotPayload
      | null;
    if (!serverSnapshot) {
      // Already resolved.
      return;
    }
    delete data._serverSnapshot;

    if (choice === "keep_mine") {
      // Use the snapshot's updated_at as the new base_version.
      const newBase = serverSnapshot.updated_at ?? row.server_updated_at;
      const stampedLocal = stampReportDataSchemaVersion(data);
      await tx.exec(
        `UPDATE reports
         SET report_data_json = ?,
             server_updated_at = ?,
             local_updated_at = ?,
             sync_state = 'dirty'
         WHERE id = ?`,
        [JSON.stringify(stampedLocal), newBase, now, reportId],
      );
      // Re-enqueue an update with the local current values.
      await enqueue({
        tx,
        entity: "report",
        entityId: reportId,
        op: "update",
        payload: {
          id: reportId,
          title: row.title,
          status: row.status,
          visit_date: row.visit_date,
          confidence: row.confidence,
          notes: parseArray(row.notes_json),
          report_data: stampedLocal,
        },
        baseVersion: newBase,
        now,
        newId: deps.newId,
      });
    } else {
      // use_server: overwrite local with the server snapshot.
      const serverData = (serverSnapshot.report_data ?? {}) as Record<
        string,
        unknown
      >;
      const stampedServer = stampReportDataSchemaVersion(serverData);
      await tx.exec(
        `UPDATE reports
         SET title = ?,
             status = ?,
             visit_date = ?,
             confidence = ?,
             notes_json = ?,
             report_data_json = ?,
             server_updated_at = ?,
             local_updated_at = ?,
             sync_state = 'synced'
         WHERE id = ?`,
        [
          serverSnapshot.title ?? row.title,
          serverSnapshot.status ?? row.status,
          serverSnapshot.visit_date ?? row.visit_date,
          serverSnapshot.confidence ?? row.confidence,
          JSON.stringify(serverSnapshot.notes ?? parseArray(row.notes_json)),
          JSON.stringify(stampedServer),
          serverSnapshot.updated_at ?? row.server_updated_at,
          now,
          reportId,
        ],
      );
      // Wipe any pending outbox rows for this report.
      await tx.exec(
        `DELETE FROM outbox WHERE entity = 'report' AND entity_id = ?`,
        [reportId],
      );
    }
  });
}

/**
 * Compute the diff used by the conflict banner. Returns the local and
 * server `report_data` snapshots plus a JSON diff list. Returns null if
 * there is no stashed conflict.
 */
export type ReportConflictDiff = {
  local: Record<string, unknown>;
  server: Record<string, unknown>;
  diff: JsonDiffEntry[];
};

export async function getReportConflictDiff(
  db: SqlExecutor,
  reportId: string,
): Promise<ReportConflictDiff | null> {
  const row = await db.get<{ report_data_json: string }>(
    "SELECT report_data_json FROM reports WHERE id = ?",
    [reportId],
  );
  if (!row) return null;
  const data = parseObject(row.report_data_json);
  const snapshot = data._serverSnapshot as
    | { report_data?: Record<string, unknown> }
    | undefined;
  if (!snapshot) return null;
  const server = (snapshot.report_data ?? {}) as Record<string, unknown>;
  const localCopy: Record<string, unknown> = { ...data };
  delete localCopy._serverSnapshot;
  // _schemaVersion is internal metadata; exclude from the user-visible diff.
  delete localCopy._schemaVersion;
  const serverCopy: Record<string, unknown> = { ...server };
  delete serverCopy._schemaVersion;
  return { local: localCopy, server: serverCopy, diff: jsonDiff(localCopy, serverCopy) };
}

function parseObject(text: string): Record<string, unknown> {
  try {
    const v = JSON.parse(text) as unknown;
    return v && typeof v === "object" && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function parseArray(text: string): unknown[] {
  try {
    const v = JSON.parse(text) as unknown;
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
