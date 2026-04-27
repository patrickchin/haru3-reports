/**
 * Project repository — local-first read/write.
 *
 * Phase 1 surface: read functions only (`listProjects`, `getProject`).
 * Phase 2 will add `upsertProject`, `softDeleteProject`, etc. that also
 * write to the outbox.
 *
 * All functions are pure orchestration — they take a `SqlExecutor` so
 * tests can substitute the in-memory `better-sqlite3` adapter and
 * production wires up `expo-sqlite`. Mirrors the DI pattern in
 * `lib/file-upload.ts`.
 */
import type { SqlExecutor } from "../sql-executor";

export type ProjectRow = {
  id: string;
  owner_id: string;
  name: string;
  address: string | null;
  client_name: string | null;
  status: "active" | "delayed" | "completed" | "archived";
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  server_updated_at: string | null;
  local_updated_at: string;
  sync_state: "synced" | "dirty" | "conflict";
};

export type ListProjectsParams = {
  ownerId: string;
  /** Include soft-deleted rows. Default false. */
  includeDeleted?: boolean;
};

export async function listProjects(
  db: SqlExecutor,
  params: ListProjectsParams,
): Promise<ProjectRow[]> {
  const where = params.includeDeleted
    ? "WHERE owner_id = ?"
    : "WHERE owner_id = ? AND deleted_at IS NULL";
  return db.all<ProjectRow>(
    `SELECT * FROM projects ${where} ORDER BY updated_at DESC`,
    [params.ownerId],
  );
}

export async function getProject(
  db: SqlExecutor,
  id: string,
): Promise<ProjectRow | null> {
  return db.get<ProjectRow>("SELECT * FROM projects WHERE id = ?", [id]);
}
