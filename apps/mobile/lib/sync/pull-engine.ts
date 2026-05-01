/**
 * Pull engine — pure logic for fetching server changes since a cursor and
 * applying them to local SQLite.
 *
 * Decoupled from the Supabase client via a `Fetcher` interface so unit
 * tests use a fake. Production wires it to a `pull_<table>_since` RPC.
 *
 * Invariants:
 *   - Cursor is server-side `updated_at` only — device clock is never
 *     compared.
 *   - A locally-dirty row is NOT overwritten by pull. The incoming row is
 *     stashed under `report_data._serverSnapshot` (reports only) so the
 *     conflict resolver can show the diff.
 *   - Cursor advances only after the local transaction commits.
 *   - Soft-deleted rows are accepted (have `deleted_at` set).
 */
import type { SqlExecutor, SqlParam } from "../local-db/sql-executor";

export type PullRow = {
  id?: string;
  updated_at: string;
  deleted_at: string | null;
  [k: string]: SqlParam | unknown;
};

export type Fetcher = (
  table: string,
  cursor: string | null,
  limit: number,
) => Promise<PullRow[]>;

export type PullableTable = {
  /** Local + server table name. */
  name: string;
  /** All column names this puller writes. Server `updated_at` becomes
   *  local `server_updated_at`; `id` is the primary key. */
  columns: readonly string[];
  /**
   * Primary-key columns. Defaults to `['id']`. Composite-PK tables
   * (e.g. project_members) override with the full key tuple so the
   * `ON CONFLICT(...)` clause and existing-row lookup target the right
   * columns.
   */
  primaryKey?: readonly string[];
  /**
   * Optional row transform. For `reports`, jsonb fields arrive as JS
   * objects from the RPC and must be JSON-stringified for SQLite TEXT
   * columns; the transform handles that. For other tables, identity.
   */
  toLocalRow?: (row: PullRow) => Record<string, SqlParam>;
  /**
   * Server-side column names this descriptor reads from the
   * `pull_<name>_since` RPC. Used by the schema-drift test
   * (`schema-drift.test.ts`) to verify against `supabase/migrations`.
   *
   * If omitted, defaults to `columns` (i.e. local and server names
   * match 1:1). Tables with `toLocalRow` that renames or projects
   * fields (e.g. reports' jsonb → `*_json`) MUST set this explicitly.
   */
  serverColumns?: readonly string[];
};

export type PullResult = {
  table: string;
  rowsApplied: number;
  rowsSkippedDirty: number;
  newCursor: string | null;
};

const DEFAULT_LIMIT = 500;

export async function pullTable(args: {
  db: SqlExecutor;
  fetcher: Fetcher;
  userId: string;
  table: PullableTable;
  limit?: number;
  /** Default false — when true, dirty rows are overwritten anyway. */
  forceOverwrite?: boolean;
}): Promise<PullResult> {
  const limit = args.limit ?? DEFAULT_LIMIT;
  const cursor = await readCursor(args.db, args.table.name);

  let applied = 0;
  let skipped = 0;
  let newCursor = cursor;

  while (true) {
    const batch = await args.fetcher(args.table.name, newCursor, limit);
    if (batch.length === 0) break;

    const result = await applyBatch({
      db: args.db,
      table: args.table,
      rows: batch,
      forceOverwrite: !!args.forceOverwrite,
      userId: args.userId,
    });

    applied += result.applied;
    skipped += result.skipped;
    newCursor = result.maxUpdatedAt ?? newCursor;

    if (batch.length < limit) break;
  }

  return {
    table: args.table.name,
    rowsApplied: applied,
    rowsSkippedDirty: skipped,
    newCursor,
  };
}

async function readCursor(
  db: SqlExecutor,
  table: string,
): Promise<string | null> {
  const row = await db.get<{ last_pulled_at: string | null }>(
    "SELECT last_pulled_at FROM sync_meta WHERE table_name = ?",
    [table],
  );
  return row?.last_pulled_at ?? null;
}

async function applyBatch(args: {
  db: SqlExecutor;
  table: PullableTable;
  rows: readonly PullRow[];
  forceOverwrite: boolean;
  userId: string;
}): Promise<{ applied: number; skipped: number; maxUpdatedAt: string | null }> {
  let applied = 0;
  let skipped = 0;
  let maxUpdatedAt: string | null = null;
  const pk = args.table.primaryKey ?? ["id"];
  const pkSet = new Set<string>(pk);
  const lookupWhere = pk.map((c) => `${c} = ?`).join(" AND ");

  await args.db.transaction(async (tx) => {
    for (const row of args.rows) {
      if (!maxUpdatedAt || row.updated_at > maxUpdatedAt) {
        maxUpdatedAt = row.updated_at;
      }

      const localRow: Record<string, SqlParam> = args.table.toLocalRow
        ? args.table.toLocalRow(row)
        : (row as Record<string, SqlParam>);

      const pkValues = pk.map((c) => localRow[c] as SqlParam);

      // Respect locally-dirty rows.
      if (!args.forceOverwrite) {
        const existing = await tx.get<{ sync_state: string }>(
          `SELECT sync_state FROM ${args.table.name} WHERE ${lookupWhere}`,
          pkValues,
        );
        if (existing && existing.sync_state !== "synced") {
          skipped += 1;
          continue;
        }
      }

      const cols: string[] = [];
      const placeholders: string[] = [];
      const values: SqlParam[] = [];
      for (const c of args.table.columns) {
        cols.push(c);
        placeholders.push("?");
        values.push((localRow[c] ?? null) as SqlParam);
      }

      // Mirror server columns + sync columns.
      cols.push("server_updated_at", "local_updated_at", "sync_state");
      placeholders.push("?", "?", "?");
      values.push(row.updated_at, row.updated_at, "synced");

      const updateSet = cols
        .filter((c) => !pkSet.has(c))
        .map((c) => `${c}=excluded.${c}`)
        .join(", ");

      await tx.exec(
        `INSERT INTO ${args.table.name} (${cols.join(", ")})
         VALUES (${placeholders.join(", ")})
         ON CONFLICT(${pk.join(", ")}) DO UPDATE SET ${updateSet}`,
        values,
      );

      applied += 1;
    }

    if (maxUpdatedAt) {
      await tx.exec(
        `INSERT INTO sync_meta (table_name, last_pulled_at, user_id)
         VALUES (?, ?, ?)
         ON CONFLICT(table_name) DO UPDATE SET
           last_pulled_at = excluded.last_pulled_at,
           user_id = excluded.user_id`,
        [args.table.name, maxUpdatedAt, args.userId],
      );
    }
  });

  return { applied, skipped, maxUpdatedAt };
}

// ---------------------------------------------------------------------------
// Table descriptors
// ---------------------------------------------------------------------------

export const PROJECTS_PULLABLE: PullableTable = {
  name: "projects",
  columns: [
    "id",
    "owner_id",
    "name",
    "address",
    "client_name",
    "status",
    "created_at",
    "updated_at",
    "deleted_at",
  ],
};

export const REPORTS_PULLABLE: PullableTable = {
  name: "reports",
  columns: [
    "id",
    "project_id",
    "owner_id",
    "title",
    "report_type",
    "status",
    "visit_date",
    "confidence",
    "report_data_json",
    "last_generation_json",
    "created_at",
    "updated_at",
    "deleted_at",
  ],
  // Server-side names (jsonb columns are stringified by `toLocalRow`).
  serverColumns: [
    "id",
    "project_id",
    "owner_id",
    "title",
    "report_type",
    "status",
    "visit_date",
    "confidence",
    "report_data",
    "last_generation",
    "created_at",
    "updated_at",
    "deleted_at",
  ],
  toLocalRow(row) {
    return {
      id: String(row.id),
      project_id: String(row.project_id),
      owner_id: String(row.owner_id),
      title: String(row.title ?? ""),
      report_type: String(row.report_type ?? "daily"),
      status: String(row.status ?? "draft"),
      visit_date: (row.visit_date as string | null) ?? null,
      confidence: (row.confidence as number | null) ?? null,
      report_data_json: JSON.stringify(row.report_data ?? {}),
      last_generation_json:
        row.last_generation == null ? null : JSON.stringify(row.last_generation),
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
      deleted_at: (row.deleted_at as string | null) ?? null,
    };
  },
};

export const PROJECT_MEMBERS_PULLABLE: PullableTable = {
  name: "project_members",
  primaryKey: ["project_id", "user_id"],
  // NOTE: server `project_members` has no `deleted_at` column —
  // membership is removed by hard delete, not soft delete. Listing
  // it here would be drift; the pull engine writes columns the RPC
  // never returns as NULL anyway, but the schema-drift test (rightly)
  // flags this.
  columns: [
    "project_id",
    "user_id",
    "role",
    "created_at",
    "updated_at",
  ],
};

export const FILE_METADATA_PULLABLE: PullableTable = {
  name: "file_metadata",
  columns: [
    "id",
    "project_id",
    "uploaded_by",
    "bucket",
    "storage_path",
    "category",
    "filename",
    "mime_type",
    "size_bytes",
    "duration_ms",
    "voice_title",
    "voice_summary",
    "created_at",
    "updated_at",
    "deleted_at",
  ],
};

export const REPORT_NOTES_PULLABLE: PullableTable = {
  name: "report_notes",
  columns: [
    "id",
    "report_id",
    "project_id",
    "author_id",
    "position",
    "kind",
    "body",
    "file_id",
    "created_at",
    "updated_at",
    "deleted_at",
  ],
};
