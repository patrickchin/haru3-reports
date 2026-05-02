import { describe, it, expect, vi } from "vitest";

import { openInMemoryDb } from "../local-db/better-sqlite-adapter";
import { runMigrations } from "../local-db/run-migrations";
import {
  createProject,
  getProject,
} from "../local-db/repositories/projects-repo";
import {
  createReport,
  getReport,
} from "../local-db/repositories/reports-repo";
import { drainOutbox, type MutationCaller } from "./push-engine";
import type { OutboxRow } from "./outbox";

const clock = () => "2026-04-27T00:00:00Z";
function makeIdGen() {
  let i = 0;
  return () => `id-${++i}`;
}
const fixedRandom = () => 0.5; // no jitter shift

describe("drainOutbox", () => {
  it("marks row as synced and removes outbox entry on applied", async () => {
    const handle = openInMemoryDb();
    try {
      await runMigrations(handle.db);
      const newId = makeIdGen();
      await createProject(
        { db: handle.db, clock, newId },
        { ownerId: "u1", name: "P" },
      );
      const caller = vi.fn<MutationCaller>(async (_entity, _payload) => ({
        status: "applied",
        server_version: "2026-04-27T00:00:01Z",
        row: {},
      }));

      const result = await drainOutbox({
        db: handle.db,
        caller,
        now: () => "2026-04-27T00:00:00Z",
      });

      expect(result.applied).toBe(1);
      expect(caller).toHaveBeenCalledOnce();
      const after = await getProject(handle.db, "id-1");
      expect(after?.sync_state).toBe("synced");
      expect(after?.server_updated_at).toBe("2026-04-27T00:00:01Z");
      const outbox = await handle.db.all<OutboxRow>("SELECT * FROM outbox");
      expect(outbox).toHaveLength(0);
    } finally {
      handle.close();
    }
  });

  it("treats duplicate the same as applied (server already had it)", async () => {
    const handle = openInMemoryDb();
    try {
      await runMigrations(handle.db);
      const newId = makeIdGen();
      await createProject(
        { db: handle.db, clock, newId },
        { ownerId: "u1", name: "P" },
      );
      const caller: MutationCaller = async () => ({
        status: "duplicate",
        server_version: "2026-04-27T00:00:02Z",
        row: {},
      });
      const r = await drainOutbox({ db: handle.db, caller, now: clock });
      expect(r.duplicates).toBe(1);
      const outbox = await handle.db.all<OutboxRow>("SELECT * FROM outbox");
      expect(outbox).toHaveLength(0);
    } finally {
      handle.close();
    }
  });

  it("on conflict — drops outbox row, marks local conflict, stashes server snapshot for reports", async () => {
    const handle = openInMemoryDb();
    try {
      await runMigrations(handle.db);
      const newId = makeIdGen();
      await createReport(
        { db: handle.db, clock, newId },
        { projectId: "p1", ownerId: "u1", title: "Local" },
      );
      const caller: MutationCaller = async () => ({
        status: "conflict",
        server_version: "2026-04-27T00:00:03Z",
        row: { id: "id-1", title: "Server", report_data: { meta: { title: "Server" } } },
      });

      const r = await drainOutbox({ db: handle.db, caller, now: clock });
      expect(r.conflicts).toBe(1);
      const after = await getReport(handle.db, "id-1");
      expect(after?.sync_state).toBe("conflict");
      // Snapshot stashed in the sibling conflict_snapshot_json column.
      const snapRow = await handle.db.get<{ conflict_snapshot_json: string | null }>(
        "SELECT conflict_snapshot_json FROM reports WHERE id = ?",
        ["id-1"],
      );
      expect(snapRow?.conflict_snapshot_json).not.toBeNull();
      const snap = JSON.parse(snapRow!.conflict_snapshot_json!) as {
        title?: string;
      };
      expect(snap.title).toBe("Server");
      // And it does NOT pollute report_data.
      expect(after?.report_data).not.toHaveProperty("_serverSnapshot");
      const outbox = await handle.db.all<OutboxRow>("SELECT * FROM outbox");
      expect(outbox).toHaveLength(0);
    } finally {
      handle.close();
    }
  });

  it("on forbidden — drops outbox row, leaves local row alone", async () => {
    const handle = openInMemoryDb();
    try {
      await runMigrations(handle.db);
      const newId = makeIdGen();
      await createProject(
        { db: handle.db, clock, newId },
        { ownerId: "u1", name: "P" },
      );
      const caller: MutationCaller = async () => ({
        status: "forbidden",
        server_version: "2026-04-27T00:00:01Z",
        row: null,
      });
      const r = await drainOutbox({ db: handle.db, caller, now: clock });
      expect(r.forbidden).toBe(1);
      const outbox = await handle.db.all<OutboxRow>("SELECT * FROM outbox");
      expect(outbox).toHaveLength(0);
      const local = await getProject(handle.db, "id-1");
      expect(local?.sync_state).toBe("dirty");
    } finally {
      handle.close();
    }
  });

  it("on transport failure — bumps attempts and schedules backoff", async () => {
    const handle = openInMemoryDb();
    try {
      await runMigrations(handle.db);
      const newId = makeIdGen();
      await createProject(
        { db: handle.db, clock, newId },
        { ownerId: "u1", name: "P" },
      );
      const caller: MutationCaller = async () => {
        throw new Error("network down");
      };
      const r = await drainOutbox({
        db: handle.db,
        caller,
        now: () => "2026-04-27T00:00:00Z",
        random: fixedRandom,
      });
      expect(r.retried).toBe(1);
      const [row] = await handle.db.all<OutboxRow>("SELECT * FROM outbox");
      expect(row?.attempts).toBe(1);
      expect(row?.last_error).toMatch(/network down/);
      expect(row?.next_attempt_at).toBe("2026-04-27T00:00:30.000Z");
    } finally {
      handle.close();
    }
  });

  it("preserves per-row ordering — stops processing later ops for the same entity on failure", async () => {
    const handle = openInMemoryDb();
    try {
      await runMigrations(handle.db);
      const newId = makeIdGen();
      await createProject(
        { db: handle.db, clock, newId },
        { ownerId: "u1", name: "A" },
      );
      // Force ops onto the same row that don't coalesce: mark first as
      // attempted so a follow-up update gets its own row.
      await handle.db.exec("UPDATE outbox SET attempts = 1");
      // Now create a SECOND row's update. Both ops will be picked but
      // the first will fail; the second (different row) should still
      // proceed.
      const newId2 = (() => {
        let i = 1;
        return () => `id-${++i}`;
      })();
      await createProject(
        { db: handle.db, clock, newId: newId2 },
        { ownerId: "u1", name: "B" },
      );

      let calls = 0;
      const caller: MutationCaller = async (entity, payload) => {
        calls += 1;
        if (payload.id === "id-1") throw new Error("boom");
        return { status: "applied", server_version: "2026-04-27T00:00:02Z", row: {} };
      };

      // Reset attempts so first row's outbox is also picked up.
      await handle.db.exec("UPDATE outbox SET attempts = 0, next_attempt_at = ?", [
        "2026-04-27T00:00:00Z",
      ]);

      const r = await drainOutbox({
        db: handle.db,
        caller,
        now: () => "2026-04-27T00:00:00Z",
        random: fixedRandom,
      });
      // First row failed (1 retry), second succeeded.
      expect(r.retried).toBe(1);
      expect(r.applied).toBe(1);
      expect(calls).toBe(2);
    } finally {
      handle.close();
    }
  });

  it("on conflict for non-report entity — sets sync_state=conflict via the generic branch", async () => {
    // Exercises onConflict's `else` branch (no snapshot column on
    // report_notes) and tableNameFor's `report_note` case.
    const { createNote } = await import(
      "../local-db/repositories/report-notes-repo"
    );
    const handle = openInMemoryDb();
    try {
      await runMigrations(handle.db);
      const newId = makeIdGen();
      // Seed a parent report so the FK on report_notes is satisfied.
      await createReport(
        { db: handle.db, clock, newId },
        { projectId: "p1", ownerId: "u1", title: "R" },
      );
      const note = await createNote(
        { db: handle.db, clock, newId },
        {
          reportId: "id-1",
          projectId: "p1",
          authorId: "u1",
          kind: "text",
          body: "hello",
        },
      );

      // Return `applied` for the report row, `conflict` (no snapshot
      // payload) for the report_note row — the latter exercises the
      // else-branch in onConflict and the report_note case in tableNameFor.
      const caller: MutationCaller = async (entity) => {
        if (entity === "report_note") {
          return {
            status: "conflict",
            server_version: "2026-04-27T00:00:05Z",
            row: null,
          };
        }
        return {
          status: "applied",
          server_version: "2026-04-27T00:00:01Z",
          row: {},
        };
      };

      const r = await drainOutbox({ db: handle.db, caller, now: clock });
      expect(r.conflicts).toBe(1);
      const noteRow = await handle.db.get<{ sync_state: string }>(
        "SELECT sync_state FROM report_notes WHERE id = ?",
        [note.id],
      );
      expect(noteRow?.sync_state).toBe("conflict");
      const outbox = await handle.db.all<OutboxRow>(
        "SELECT * FROM outbox WHERE entity = 'report_note'",
      );
      expect(outbox).toHaveLength(0);
    } finally {
      handle.close();
    }
  });

  it("on applied for a delete op — uses the delete-specific update branch in onApplied", async () => {
    // Reaches the `if (row.op === 'delete')` branch in onApplied.
    const { softDeleteReport } = await import(
      "../local-db/repositories/reports-repo"
    );
    const handle = openInMemoryDb();
    try {
      await runMigrations(handle.db);
      const newId = makeIdGen();
      await createReport(
        { db: handle.db, clock, newId },
        { projectId: "p1", ownerId: "u1", title: "T" },
      );
      // First drain: clears the queued INSERT cleanly so the soft-delete
      // does not coalesce it back into a single row.
      const callerApplyInsert: MutationCaller = async () => ({
        status: "applied",
        server_version: "2026-04-27T00:00:01Z",
        row: {},
      });
      await drainOutbox({ db: handle.db, caller: callerApplyInsert, now: clock });
      // Now soft-delete — produces a fresh outbox row with op='delete'.
      await softDeleteReport({ db: handle.db, clock, newId }, "id-1");
      const callerApplyDelete: MutationCaller = async () => ({
        status: "applied",
        server_version: "2026-04-27T00:00:09Z",
        row: {},
      });
      const r = await drainOutbox({
        db: handle.db,
        caller: callerApplyDelete,
        now: clock,
      });
      expect(r.applied).toBe(1);
      const after = await getReport(handle.db, "id-1");
      expect(after?.sync_state).toBe("synced");
      expect(after?.server_updated_at).toBe("2026-04-27T00:00:09Z");
      expect(after?.deleted_at).not.toBeNull();
    } finally {
      handle.close();
    }
  });

  it("on conflict for a file_metadata row — uses the generic else branch and tableNameFor's file_metadata case", async () => {
    const handle = openInMemoryDb();
    try {
      await runMigrations(handle.db);
      // Seed a file_metadata row + a queued outbox INSERT for it. There
      // is no client-side file_metadata repository yet, so we write
      // directly — the goal is to exercise tableNameFor("file_metadata")
      // + onConflict's else-branch under push-engine's drain.
      const now = clock();
      await handle.db.exec(
        `INSERT INTO file_metadata (
           id, project_id, uploaded_by, bucket, storage_path, category,
           filename, mime_type, size_bytes,
           created_at, updated_at, deleted_at,
           server_updated_at, local_updated_at, sync_state
         ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          "f1", "p1", "u1", "project-files", "p1/documents/f1.pdf", "document",
          "x.pdf", "application/pdf", 1,
          now, now, null,
          null, now, "dirty",
        ],
      );
      await handle.db.exec(
        `INSERT INTO outbox (
           entity, entity_id, op, payload_json, base_version,
           attempts, next_attempt_at, client_op_id, created_at, state
         ) VALUES (?,?,?,?,?,0,?,?,?,'queued')`,
        ["file_metadata", "f1", "insert", JSON.stringify({ id: "f1" }), null, now, "cop-f1", now],
      );

      const caller: MutationCaller = async () => ({
        status: "conflict",
        server_version: "2026-04-27T00:00:07Z",
        row: { id: "f1" },
      });
      const r = await drainOutbox({ db: handle.db, caller, now: clock });
      expect(r.conflicts).toBe(1);
      const after = await handle.db.get<{ sync_state: string }>(
        "SELECT sync_state FROM file_metadata WHERE id = ?",
        ["f1"],
      );
      expect(after?.sync_state).toBe("conflict");
    } finally {
      handle.close();
    }
  });

  it("on permanent failure — burns out the row via markPermanentlyFailed", async () => {
    const handle = openInMemoryDb();
    try {
      await runMigrations(handle.db);
      const newId = makeIdGen();
      await createReport(
        { db: handle.db, clock, newId },
        { projectId: "p1", ownerId: "u1", title: "T" },
      );
      // Bump attempts to MAX_ATTEMPTS - 1 so the next failed attempt
      // crosses the permanent-failure threshold.
      await handle.db.exec(
        "UPDATE outbox SET attempts = ?, next_attempt_at = ?",
        [9, clock()],
      );
      const caller: MutationCaller = async () => {
        throw new Error("still down");
      };
      const r = await drainOutbox({
        db: handle.db,
        caller,
        now: clock,
        random: fixedRandom,
      });
      expect(r.permanentlyFailed).toBe(1);
      expect(r.retried).toBe(0);
      const [row] = await handle.db.all<OutboxRow>("SELECT * FROM outbox");
      // markPermanentlyFailed parks the row out of the ready set.
      expect(row?.state).not.toBe("queued");
      expect(row?.last_error).toMatch(/permanent: still down/);
    } finally {
      handle.close();
    }
  });
});
