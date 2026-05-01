/**
 * Report-notes repository — local-first read/write.
 *
 * Each note is one input item to a report: either raw text, or a reference
 * to an uploaded file (voice, image, video, document). Notes are ordered by
 * `position` (dense, 1-based, no gaps required).
 */
import { enqueue } from "../../sync/outbox";
import type { Clock, IdGen } from "../clock";
import type { SqlExecutor } from "../sql-executor";

export type NoteKind = "text" | "voice" | "image" | "video" | "document";

export type ReportNoteRow = {
  id: string;
  report_id: string;
  project_id: string;
  author_id: string;
  position: number;
  kind: NoteKind;
  body: string | null;
  file_id: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  server_updated_at: string | null;
  local_updated_at: string;
  sync_state: "synced" | "dirty" | "conflict";
};

// ---------------------------------------------------------------------------
// Read side
// ---------------------------------------------------------------------------

export type ListNotesParams = {
  reportId: string;
  includeDeleted?: boolean;
};

export async function listNotes(
  db: SqlExecutor,
  params: ListNotesParams,
): Promise<ReportNoteRow[]> {
  const where = params.includeDeleted
    ? "WHERE report_id = ?"
    : "WHERE report_id = ? AND deleted_at IS NULL";
  return db.all<ReportNoteRow>(
    `SELECT * FROM report_notes ${where} ORDER BY position ASC`,
    [params.reportId],
  );
}

export async function getNote(
  db: SqlExecutor,
  id: string,
): Promise<ReportNoteRow | null> {
  const row = await db.get<ReportNoteRow>(
    "SELECT * FROM report_notes WHERE id = ?",
    [id],
  );
  return row ?? null;
}

// ---------------------------------------------------------------------------
// Write side
// ---------------------------------------------------------------------------

type WriteDeps = {
  db: SqlExecutor;
  clock: Clock;
  newId: IdGen;
  /** Pre-existing transaction to join. When provided, the write runs
   *  inside it instead of opening a new transaction. The caller is
   *  responsible for commit/rollback. */
  tx?: SqlExecutor;
};

export type CreateNoteInput = {
  reportId: string;
  projectId: string;
  authorId: string;
  kind: NoteKind;
  body?: string | null;
  fileId?: string | null;
  position?: number;
};

export async function createNote(
  deps: WriteDeps,
  input: CreateNoteInput,
): Promise<ReportNoteRow> {
  const id = deps.newId();
  const now = deps.clock();

  async function doCreate(tx: SqlExecutor): Promise<ReportNoteRow> {
    // Auto-assign position: max(position) + 1 for this report.
    let position = input.position;
    if (position == null) {
      const result = await tx.get<{ max_pos: number | null }>(
        "SELECT MAX(position) as max_pos FROM report_notes WHERE report_id = ? AND deleted_at IS NULL",
        [input.reportId],
      );
      position = (result?.max_pos ?? 0) + 1;
    }

    const row: ReportNoteRow = {
      id,
      report_id: input.reportId,
      project_id: input.projectId,
      author_id: input.authorId,
      position,
      kind: input.kind,
      body: input.body ?? null,
      file_id: input.fileId ?? null,
      deleted_at: null,
      created_at: now,
      updated_at: now,
      server_updated_at: null,
      local_updated_at: now,
      sync_state: "dirty",
    };

    await tx.exec(
      `INSERT INTO report_notes (
        id, report_id, project_id, author_id, position,
        kind, body, file_id,
        deleted_at, created_at, updated_at,
        server_updated_at, local_updated_at, sync_state
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        row.id, row.report_id, row.project_id, row.author_id, row.position,
        row.kind, row.body, row.file_id,
        row.deleted_at, row.created_at, row.updated_at,
        row.server_updated_at, row.local_updated_at, row.sync_state,
      ],
    );
    await enqueue({
      tx,
      entity: "report_note",
      entityId: row.id,
      op: "insert",
      payload: {
        id: row.id,
        report_id: row.report_id,
        project_id: row.project_id,
        position: row.position,
        kind: row.kind,
        body: row.body,
        file_id: row.file_id,
      },
      baseVersion: null,
      now,
      newId: deps.newId,
    });

    return row;
  }

  if (deps.tx) {
    return doCreate(deps.tx);
  }
  return deps.db.transaction(async (tx) => doCreate(tx));
}

export type UpdateNoteFields = Partial<{
  body: string | null;
  position: number;
  kind: NoteKind;
  file_id: string | null;
}>;

export async function updateNote(
  deps: WriteDeps,
  id: string,
  fields: UpdateNoteFields,
): Promise<void> {
  const now = deps.clock();
  await deps.db.transaction(async (tx) => {
    const existing = await tx.get<{ server_updated_at: string | null }>(
      "SELECT server_updated_at FROM report_notes WHERE id = ?",
      [id],
    );
    if (!existing) {
      throw new Error(`updateNote: ${id} not found`);
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
      `UPDATE report_notes SET ${sets.join(", ")} WHERE id = ?`,
      values,
    );

    await enqueue({
      tx,
      entity: "report_note",
      entityId: id,
      op: "update",
      payload: { id, ...fields },
      baseVersion: existing.server_updated_at,
      now,
      newId: deps.newId,
    });
  });
}

export async function deleteNote(
  deps: WriteDeps,
  id: string,
): Promise<void> {
  const now = deps.clock();
  await deps.db.transaction(async (tx) => {
    const existing = await tx.get<{ server_updated_at: string | null }>(
      "SELECT server_updated_at FROM report_notes WHERE id = ?",
      [id],
    );
    if (!existing) {
      throw new Error(`deleteNote: ${id} not found`);
    }
    await tx.exec(
      "UPDATE report_notes SET deleted_at = ?, local_updated_at = ?, sync_state = ? WHERE id = ?",
      [now, now, "dirty", id],
    );
    await enqueue({
      tx,
      entity: "report_note",
      entityId: id,
      op: "delete",
      payload: { id },
      baseVersion: existing.server_updated_at,
      now,
      newId: deps.newId,
    });
  });
}
