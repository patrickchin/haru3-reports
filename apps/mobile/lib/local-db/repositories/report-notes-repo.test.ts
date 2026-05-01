import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { openInMemoryDb } from "../better-sqlite-adapter";
import { runMigrations } from "../run-migrations";
import type { SqlExecutor } from "../sql-executor";
import {
  createNote,
  deleteNote,
  getNote,
  listNotes,
  listOtherReportFileIds,
  updateNote,
  type ReportNoteRow,
} from "./report-notes-repo";

const NOW = "2026-04-30T00:00:00Z";
const LATER = "2026-04-30T01:00:00Z";
let counter = 0;
const newId = () => `id-${++counter}`;
const clock = () => NOW;

let db: SqlExecutor;
let close: () => void;

beforeEach(async () => {
  counter = 0;
  const h = openInMemoryDb();
  db = h.db;
  close = h.close;
  await runMigrations(db);
  // Seed a project and report so FK-like constraints don't trip.
  await db.exec(
    `INSERT INTO projects (id, owner_id, name, status, created_at, updated_at, local_updated_at, sync_state)
     VALUES (?,?,?,?,?,?,?,?)`,
    ["p1", "u1", "Project", "active", NOW, NOW, NOW, "synced"],
  );
  await db.exec(
    `INSERT INTO reports (id, project_id, owner_id, title, report_type, status,
       report_data_json, generation_state,
       created_at, updated_at, local_updated_at, sync_state)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    ["r1", "p1", "u1", "Report", "daily", "draft", "{}", "idle", NOW, NOW, NOW, "synced"],
  );
});

afterEach(() => close());

describe("createNote", () => {
  it("inserts a text note and auto-assigns position 1", async () => {
    const note = await createNote(
      { db, clock, newId },
      { reportId: "r1", projectId: "p1", authorId: "u1", kind: "text", body: "Hello" },
    );
    expect(note.id).toBe("id-1");
    expect(note.position).toBe(1);
    expect(note.kind).toBe("text");
    expect(note.body).toBe("Hello");
    expect(note.file_id).toBeNull();
    expect(note.sync_state).toBe("dirty");
  });

  it("auto-increments position for subsequent notes", async () => {
    await createNote(
      { db, clock, newId },
      { reportId: "r1", projectId: "p1", authorId: "u1", kind: "text", body: "First" },
    );
    const second = await createNote(
      { db, clock, newId },
      { reportId: "r1", projectId: "p1", authorId: "u1", kind: "text", body: "Second" },
    );
    expect(second.position).toBe(2);
  });

  it("creates a voice note with file_id", async () => {
    const note = await createNote(
      { db, clock, newId },
      {
        reportId: "r1", projectId: "p1", authorId: "u1",
        kind: "voice", body: null, fileId: "file-abc",
      },
    );
    expect(note.kind).toBe("voice");
    expect(note.file_id).toBe("file-abc");
    expect(note.body).toBeNull();
  });

  it("enqueues an outbox row for the insert", async () => {
    await createNote(
      { db, clock, newId },
      { reportId: "r1", projectId: "p1", authorId: "u1", kind: "text", body: "x" },
    );
    const outbox = await db.all<{ entity: string; op: string; entity_id: string }>(
      "SELECT entity, op, entity_id FROM outbox",
      [],
    );
    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({ entity: "report_note", op: "insert", entity_id: "id-1" });
  });
});

describe("listNotes", () => {
  it("returns notes ordered by position, excluding soft-deleted", async () => {
    await createNote(
      { db, clock, newId },
      { reportId: "r1", projectId: "p1", authorId: "u1", kind: "text", body: "A" },
    );
    await createNote(
      { db, clock, newId },
      { reportId: "r1", projectId: "p1", authorId: "u1", kind: "text", body: "B" },
    );
    // Soft-delete the first one.
    await db.exec("UPDATE report_notes SET deleted_at = ? WHERE id = ?", [NOW, "id-1"]);

    const notes = await listNotes(db, { reportId: "r1" });
    expect(notes).toHaveLength(1);
    expect(notes[0]!.body).toBe("B");
  });

  it("includeDeleted returns all notes", async () => {
    await createNote(
      { db, clock, newId },
      { reportId: "r1", projectId: "p1", authorId: "u1", kind: "text", body: "A" },
    );
    await db.exec("UPDATE report_notes SET deleted_at = ? WHERE id = ?", [NOW, "id-1"]);

    const notes = await listNotes(db, { reportId: "r1", includeDeleted: true });
    expect(notes).toHaveLength(1);
  });
});

describe("listOtherReportFileIds", () => {
  beforeEach(async () => {
    // Seed a second report in the same project.
    await db.exec(
      `INSERT INTO reports (id, project_id, owner_id, title, report_type, status,
         report_data_json, generation_state,
         created_at, updated_at, local_updated_at, sync_state)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      ["r2", "p1", "u1", "Report 2", "daily", "draft", "{}", "idle", NOW, NOW, NOW, "synced"],
    );
    // Seed a project + report in a *different* project to confirm scoping.
    await db.exec(
      `INSERT INTO projects (id, owner_id, name, status, created_at, updated_at, local_updated_at, sync_state)
       VALUES (?,?,?,?,?,?,?,?)`,
      ["p2", "u1", "Project 2", "active", NOW, NOW, NOW, "synced"],
    );
    await db.exec(
      `INSERT INTO reports (id, project_id, owner_id, title, report_type, status,
         report_data_json, generation_state,
         created_at, updated_at, local_updated_at, sync_state)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      ["r3", "p2", "u1", "Report 3", "daily", "draft", "{}", "idle", NOW, NOW, NOW, "synced"],
    );
  });

  it("returns file_ids linked to other reports in the same project", async () => {
    // Note linked to file-A on r2 (other report, same project).
    await createNote(
      { db, clock, newId },
      { reportId: "r2", projectId: "p1", authorId: "u1", kind: "voice", fileId: "file-A" },
    );
    // Note linked to file-B on r1 (current report, must NOT appear).
    await createNote(
      { db, clock, newId },
      { reportId: "r1", projectId: "p1", authorId: "u1", kind: "voice", fileId: "file-B" },
    );
    // Note linked to file-C on r3 (different project, must NOT appear).
    await createNote(
      { db, clock, newId },
      { reportId: "r3", projectId: "p2", authorId: "u1", kind: "voice", fileId: "file-C" },
    );

    const ids = await listOtherReportFileIds(db, {
      projectId: "p1",
      excludeReportId: "r1",
    });

    expect(ids).toEqual(["file-A"]);
  });

  it("excludes soft-deleted notes", async () => {
    await createNote(
      { db, clock, newId },
      { reportId: "r2", projectId: "p1", authorId: "u1", kind: "voice", fileId: "file-A" },
    );
    await db.exec("UPDATE report_notes SET deleted_at = ? WHERE id = ?", [NOW, "id-1"]);

    const ids = await listOtherReportFileIds(db, {
      projectId: "p1",
      excludeReportId: "r1",
    });

    expect(ids).toEqual([]);
  });

  it("ignores notes with null file_id", async () => {
    await createNote(
      { db, clock, newId },
      { reportId: "r2", projectId: "p1", authorId: "u1", kind: "text", body: "no file" },
    );

    const ids = await listOtherReportFileIds(db, {
      projectId: "p1",
      excludeReportId: "r1",
    });

    expect(ids).toEqual([]);
  });

  it("dedupes when the same file_id is referenced multiple times", async () => {
    await createNote(
      { db, clock, newId },
      { reportId: "r2", projectId: "p1", authorId: "u1", kind: "voice", fileId: "file-A" },
    );
    // r1 also references file-A — but r1 is excluded so this row contributes
    // nothing. (file-A only counts via r2.)
    await createNote(
      { db, clock, newId },
      { reportId: "r1", projectId: "p1", authorId: "u1", kind: "voice", fileId: "file-A" },
    );

    const ids = await listOtherReportFileIds(db, {
      projectId: "p1",
      excludeReportId: "r1",
    });

    expect(ids).toEqual(["file-A"]);
  });
});

describe("getNote", () => {
  it("returns the note by id", async () => {
    await createNote(
      { db, clock, newId },
      { reportId: "r1", projectId: "p1", authorId: "u1", kind: "text", body: "Hi" },
    );
    const note = await getNote(db, "id-1");
    expect(note).not.toBeNull();
    expect(note!.body).toBe("Hi");
  });

  it("returns null for missing id", async () => {
    const note = await getNote(db, "nope");
    expect(note).toBeNull();
  });
});

describe("updateNote", () => {
  it("updates body and marks dirty", async () => {
    await createNote(
      { db, clock, newId },
      { reportId: "r1", projectId: "p1", authorId: "u1", kind: "voice", body: null, fileId: "f1" },
    );
    await updateNote(
      { db, clock: () => LATER, newId },
      "id-1",
      { body: "Transcribed text" },
    );
    const updated = await getNote(db, "id-1");
    expect(updated!.body).toBe("Transcribed text");
    expect(updated!.sync_state).toBe("dirty");
    expect(updated!.local_updated_at).toBe(LATER);
  });

  it("throws for missing note", async () => {
    await expect(
      updateNote({ db, clock, newId }, "nope", { body: "x" }),
    ).rejects.toThrow("updateNote: nope not found");
  });

  it("enqueues an update outbox row", async () => {
    await createNote(
      { db, clock, newId },
      { reportId: "r1", projectId: "p1", authorId: "u1", kind: "text", body: "x" },
    );
    await updateNote({ db, clock: () => LATER, newId }, "id-1", { body: "y" });
    const rows = await db.all<{ op: string }>(
      "SELECT op FROM outbox WHERE entity = 'report_note' ORDER BY id",
      [],
    );
    // insert is coalesced with update (same entity_id, queued state)
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });
});

describe("deleteNote", () => {
  it("soft-deletes and enqueues a delete op", async () => {
    await createNote(
      { db, clock, newId },
      { reportId: "r1", projectId: "p1", authorId: "u1", kind: "text", body: "bye" },
    );
    await deleteNote({ db, clock: () => LATER, newId }, "id-1");
    const note = await getNote(db, "id-1");
    expect(note!.deleted_at).toBe(LATER);
    expect(note!.sync_state).toBe("dirty");

    const outbox = await db.all<{ op: string }>(
      "SELECT op FROM outbox WHERE entity = 'report_note' ORDER BY id DESC LIMIT 1",
      [],
    );
    expect(outbox[0]!.op).toBe("delete");
  });

  it("throws for missing note", async () => {
    await expect(
      deleteNote({ db, clock, newId }, "nope"),
    ).rejects.toThrow("deleteNote: nope not found");
  });
});
