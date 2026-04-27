/**
 * Report repository — local-first read/write.
 *
 * Phase 1: read-only. Reports' jsonb-shaped fields (`notes`, `report_data`)
 * are stored as TEXT and parsed at the boundary so callers can work with
 * typed objects instead of raw strings.
 */
import type { SqlExecutor } from "../sql-executor";

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
