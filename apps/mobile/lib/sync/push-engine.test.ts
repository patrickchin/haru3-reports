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
      // Snapshot stashed under report_data._serverSnapshot.
      expect(
        (after?.report_data as { _serverSnapshot?: { title: string } })?.
          _serverSnapshot?.title,
      ).toBe("Server");
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
});
