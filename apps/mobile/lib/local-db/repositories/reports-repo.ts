/**
 * Report repository — local-first read/write.
 *
 * Phase 1: read-only. Reports' jsonb-shaped fields (`notes`, `report_data`)
 * are stored as TEXT and parsed at the boundary so callers can work with
 * typed objects instead of raw strings.
 */
import { enqueue } from "../../sync/outbox";
import type { Clock, IdGen } from "../clock";
import type { SqlExecutor } from "../sql-executor";

/**
 * Schema version stamped onto `report_data` whenever the local app writes
 * generated/edited report content. Lets future readers (and migrations)
 * tell which shape of report payload they are looking at.
 *
 * Bump this when `report_data` shape changes in a non-additive way; add
 * a forward-compatible migration in `normalizeGeneratedReportPayload` /
 * the report renderer at the same time.
 */
export const REPORT_DATA_SCHEMA_VERSION = 1;

/** Returns a copy of `data` with `_schemaVersion` stamped. */
export function stampReportDataSchemaVersion(
  data: Record<string, unknown>,
): Record<string, unknown> {
  return { ...data, _schemaVersion: REPORT_DATA_SCHEMA_VERSION };
}

export type ReportRow = {
  id: string;
  project_id: string;
  owner_id: string;
  title: string;
  report_type: string;
  status: "draft" | "final";
  visit_date: string | null;
  confidence: number | null;
  notes: unknown[];
  report_data: Record<string, unknown>;
  generation_state: "idle" | "queued" | "running" | "completed" | "failed";
  generation_error: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  server_updated_at: string | null;
  local_updated_at: string;
  sync_state: "synced" | "dirty" | "conflict";
};

type ReportSqlRow = Omit<ReportRow, "notes" | "report_data"> & {
  notes_json: string;
  report_data_json: string;
};

function fromSql(row: ReportSqlRow): ReportRow {
  const { notes_json, report_data_json, ...rest } = row;
  return {
    ...rest,
    notes: parseJsonArray(notes_json),
    report_data: parseJsonObject(report_data_json),
  };
}

function parseJsonArray(text: string): unknown[] {
  try {
    const v = JSON.parse(text) as unknown;
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function parseJsonObject(text: string): Record<string, unknown> {
  try {
    const v = JSON.parse(text) as unknown;
    return v && typeof v === "object" && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export type ListReportsParams = {
  projectId: string;
  includeDeleted?: boolean;
};

export async function listReports(
  db: SqlExecutor,
  params: ListReportsParams,
): Promise<ReportRow[]> {
  const where = params.includeDeleted
    ? "WHERE project_id = ?"
    : "WHERE project_id = ? AND deleted_at IS NULL";
  const rows = await db.all<ReportSqlRow>(
    `SELECT * FROM reports ${where} ORDER BY visit_date DESC, updated_at DESC`,
    [params.projectId],
  );
  return rows.map(fromSql);
}

export async function getReport(
  db: SqlExecutor,
  id: string,
): Promise<ReportRow | null> {
  const row = await db.get<ReportSqlRow>(
    "SELECT * FROM reports WHERE id = ?",
    [id],
  );
  return row ? fromSql(row) : null;
}

// ---------------------------------------------------------------------------
// Write side (Phase 2)
// ---------------------------------------------------------------------------

type WriteDeps = {
  db: SqlExecutor;
  clock: Clock;
  newId: IdGen;
};

export type CreateReportInput = {
  projectId: string;
  ownerId: string;
  title?: string;
  reportType?: string;
  status?: "draft" | "final";
  visitDate?: string | null;
};

export type UpdateReportFields = Partial<{
  title: string;
  status: "draft" | "final";
  visit_date: string | null;
  confidence: number | null;
  notes: unknown[];
  report_data: Record<string, unknown>;
}>;

export async function createReport(
  deps: WriteDeps,
  input: CreateReportInput,
): Promise<ReportRow> {
  const id = deps.newId();
  const now = deps.clock();
  const row: ReportRow = {
    id,
    project_id: input.projectId,
    owner_id: input.ownerId,
    title: input.title ?? "",
    report_type: input.reportType ?? "daily",
    status: input.status ?? "draft",
    visit_date: input.visitDate ?? null,
    confidence: null,
    notes: [],
    report_data: {},
    generation_state: "idle",
    generation_error: null,
    created_at: now,
    updated_at: now,
    deleted_at: null,
    server_updated_at: null,
    local_updated_at: now,
    sync_state: "dirty",
  };
  await deps.db.transaction(async (tx) => {
    await tx.exec(
      `INSERT INTO reports (
        id, project_id, owner_id, title, report_type, status,
        visit_date, confidence, notes_json, report_data_json,
        generation_state, generation_error,
        created_at, updated_at, deleted_at,
        server_updated_at, local_updated_at, sync_state
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        row.id, row.project_id, row.owner_id, row.title, row.report_type, row.status,
        row.visit_date, row.confidence, "[]", "{}",
        row.generation_state, row.generation_error,
        row.created_at, row.updated_at, row.deleted_at,
        row.server_updated_at, row.local_updated_at, row.sync_state,
      ],
    );
    await enqueue({
      tx,
      entity: "report",
      entityId: row.id,
      op: "insert",
      // owner_id intentionally omitted: the server RPC forces it to
      // auth.uid() and ignores any value supplied by the payload.
      payload: {
        id: row.id,
        project_id: row.project_id,
        title: row.title,
        report_type: row.report_type,
        status: row.status,
        visit_date: row.visit_date,
      },
      baseVersion: null,
      now,
      newId: deps.newId,
    });
  });
  return row;
}

export async function updateReport(
  deps: WriteDeps,
  id: string,
  fields: UpdateReportFields,
): Promise<void> {
  const now = deps.clock();
  await deps.db.transaction(async (tx) => {
    const existing = await tx.get<{ server_updated_at: string | null }>(
      "SELECT server_updated_at FROM reports WHERE id = ?",
      [id],
    );
    if (!existing) {
      throw new Error(`updateReport: ${id} not found`);
    }
    const sets: string[] = [];
    const values: (string | number | null)[] = [];
    for (const [k, v] of Object.entries(fields)) {
      if (k === "notes") {
        sets.push("notes_json = ?");
        values.push(JSON.stringify(v ?? []));
      } else if (k === "report_data") {
        sets.push("report_data_json = ?");
        const stamped = stampReportDataSchemaVersion(
          (v ?? {}) as Record<string, unknown>,
        );
        values.push(JSON.stringify(stamped));
      } else {
        sets.push(`${k} = ?`);
        values.push(v as string | number | null);
      }
    }
    sets.push("local_updated_at = ?", "sync_state = ?");
    values.push(now, "dirty");
    values.push(id);
    await tx.exec(`UPDATE reports SET ${sets.join(", ")} WHERE id = ?`, values);
    await enqueue({
      tx,
      entity: "report",
      entityId: id,
      op: "update",
      payload: { id, ...fields },
      baseVersion: existing.server_updated_at,
      now,
      newId: deps.newId,
    });
  });
}

export async function softDeleteReport(
  deps: WriteDeps,
  id: string,
): Promise<void> {
  const now = deps.clock();
  await deps.db.transaction(async (tx) => {
    const existing = await tx.get<{ server_updated_at: string | null }>(
      "SELECT server_updated_at FROM reports WHERE id = ?",
      [id],
    );
    if (!existing) return;
    await tx.exec(
      `UPDATE reports SET deleted_at = ?, local_updated_at = ?, sync_state = 'dirty' WHERE id = ?`,
      [now, now, id],
    );
    await enqueue({
      tx,
      entity: "report",
      entityId: id,
      op: "delete",
      payload: { id },
      baseVersion: existing.server_updated_at,
      now,
      newId: deps.newId,
    });
  });
}
