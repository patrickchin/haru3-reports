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
import { enqueue } from "../../sync/outbox";
import type { Clock, IdGen } from "../clock";
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

/**
 * Returns all projects visible to the current user — i.e. every row in
 * the local mirror that hasn't been soft-deleted. Local DB is per-user,
 * so RLS visibility is already enforced at pull time; we don't filter
 * by owner here so editor/viewer members are included.
 */
export async function listAccessibleProjects(
  db: SqlExecutor,
): Promise<ProjectRow[]> {
  return db.all<ProjectRow>(
    `SELECT * FROM projects WHERE deleted_at IS NULL ORDER BY updated_at DESC`,
  );
}

/**
 * Returns a Map of projectId → role for the given user from the local
 * `project_members` mirror.
 */
export async function listMemberRoles(
  db: SqlExecutor,
  userId: string,
): Promise<Map<string, string>> {
  const rows = await db.all<{ project_id: string; role: string }>(
    `SELECT project_id, role FROM project_members
       WHERE user_id = ? AND deleted_at IS NULL`,
    [userId],
  );
  return new Map(rows.map((r) => [r.project_id, r.role]));
}

// ---------------------------------------------------------------------------
// Write side (Phase 2)
// ---------------------------------------------------------------------------

export type CreateProjectInput = {
  ownerId: string;
  name: string;
  address?: string | null;
  clientName?: string | null;
  status?: ProjectRow["status"];
};

export type UpdateProjectFields = Partial<
  Pick<ProjectRow, "name" | "address" | "client_name" | "status">
>;

type WriteDeps = {
  db: SqlExecutor;
  clock: Clock;
  newId: IdGen;
};

export async function createProject(
  deps: WriteDeps,
  input: CreateProjectInput,
): Promise<ProjectRow> {
  const id = deps.newId();
  const now = deps.clock();
  const row: ProjectRow = {
    id,
    owner_id: input.ownerId,
    name: input.name,
    address: input.address ?? null,
    client_name: input.clientName ?? null,
    status: input.status ?? "active",
    created_at: now,
    updated_at: now,
    deleted_at: null,
    server_updated_at: null,
    local_updated_at: now,
    sync_state: "dirty",
  };

  await deps.db.transaction(async (tx) => {
    await tx.exec(
      `INSERT INTO projects (
        id, owner_id, name, address, client_name, status,
        created_at, updated_at, deleted_at,
        server_updated_at, local_updated_at, sync_state
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        row.id, row.owner_id, row.name, row.address, row.client_name, row.status,
        row.created_at, row.updated_at, row.deleted_at,
        row.server_updated_at, row.local_updated_at, row.sync_state,
      ],
    );
    await enqueue({
      tx,
      entity: "project",
      entityId: row.id,
      op: "insert",
      payload: {
        id: row.id,
        owner_id: row.owner_id,
        name: row.name,
        address: row.address,
        client_name: row.client_name,
        status: row.status,
      },
      baseVersion: null,
      now,
      newId: deps.newId,
    });
  });

  return row;
}

export async function updateProject(
  deps: WriteDeps,
  id: string,
  fields: UpdateProjectFields,
): Promise<void> {
  const now = deps.clock();
  await deps.db.transaction(async (tx) => {
    const existing = await tx.get<ProjectRow>(
      "SELECT * FROM projects WHERE id = ?",
      [id],
    );
    if (!existing) {
      throw new Error(`updateProject: project ${id} not found`);
    }
    const sets: string[] = [];
    const values: (string | number | null)[] = [];
    for (const [k, v] of Object.entries(fields)) {
      sets.push(`${k} = ?`);
      values.push(v as string | number | null);
    }
    sets.push("local_updated_at = ?", "sync_state = ?");
    values.push(now, "dirty");
    values.push(id);
    await tx.exec(
      `UPDATE projects SET ${sets.join(", ")} WHERE id = ?`,
      values,
    );
    await enqueue({
      tx,
      entity: "project",
      entityId: id,
      op: "update",
      payload: { id, ...fields },
      baseVersion: existing.server_updated_at,
      now,
      newId: deps.newId,
    });
  });
}

export async function softDeleteProject(
  deps: WriteDeps,
  id: string,
): Promise<void> {
  const now = deps.clock();
  await deps.db.transaction(async (tx) => {
    const existing = await tx.get<ProjectRow>(
      "SELECT * FROM projects WHERE id = ?",
      [id],
    );
    if (!existing) return;
    await tx.exec(
      `UPDATE projects SET deleted_at = ?, local_updated_at = ?, sync_state = 'dirty' WHERE id = ?`,
      [now, now, id],
    );
    await enqueue({
      tx,
      entity: "project",
      entityId: id,
      op: "delete",
      payload: { id },
      baseVersion: existing.server_updated_at,
      now,
      newId: deps.newId,
    });
  });
}
