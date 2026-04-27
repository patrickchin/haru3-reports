import { describe, it, expect } from "vitest";

import { openInMemoryDb } from "../local-db/better-sqlite-adapter";
import { runMigrations } from "../local-db/run-migrations";
import {
  createReport,
  getReport,
  updateReport,
} from "../local-db/repositories/reports-repo";
import { drainOutbox } from "./push-engine";
import {
  getReportConflictDiff,
  resolveReportConflict,
} from "./conflict-resolver";
import type { OutboxRow } from "./outbox";

const clock = () => "2026-04-27T00:00:00Z";
function makeIdGen() {
  let i = 0;
  return () => `id-${++i}`;
}

async function setupConflictedReport(handle: {
  db: import("../local-db/sql-executor").SqlExecutor;
}) {
  await runMigrations(handle.db);
  const newId = makeIdGen();
  await createReport(
    { db: handle.db, clock, newId },
    { projectId: "p1", ownerId: "u1", title: "Local" },
  );
  await updateReport(
    { db: handle.db, clock, newId },
    "id-1",
    { report_data: { meta: { title: "Local" } } },
  );
  // Pretend the server returned a conflict with its own version.
  await drainOutbox({
    db: handle.db,
    caller: async () => ({
      status: "conflict",
      server_version: "2026-04-27T00:00:05Z",
      row: {
        id: "id-1",
        title: "Server Title",
        status: "draft",
        notes: [{ id: "n1", text: "from server" }],
        report_data: { meta: { title: "Server Title", summary: "S" } },
        updated_at: "2026-04-27T00:00:05Z",
      },
    }),
    now: clock,
  });
}

describe("getReportConflictDiff", () => {
  it("returns local + server + diff entries when there is a conflict", async () => {
    const handle = openInMemoryDb();
    try {
      await setupConflictedReport(handle);
      const out = await getReportConflictDiff(handle.db, "id-1");
      expect(out).not.toBeNull();
      expect(out!.local).toEqual({ meta: { title: "Local" } });
      expect(out!.server).toEqual({ meta: { title: "Server Title", summary: "S" } });
      const paths = out!.diff.map((d) => `${d.kind}:${d.path}`).sort();
      expect(paths).toEqual([
        "added:meta.summary",
        "changed:meta.title",
      ]);
    } finally {
      handle.close();
    }
  });

  it("returns null when there is no conflict", async () => {
    const handle = openInMemoryDb();
    try {
      await runMigrations(handle.db);
      const newId = makeIdGen();
      await createReport(
        { db: handle.db, clock, newId },
        { projectId: "p1", ownerId: "u1" },
      );
      expect(await getReportConflictDiff(handle.db, "id-1")).toBeNull();
    } finally {
      handle.close();
    }
  });
});

describe("resolveReportConflict — keep_mine", () => {
  it("strips server snapshot, marks dirty, and re-enqueues with new base_version", async () => {
    const handle = openInMemoryDb();
    try {
      await setupConflictedReport(handle);
      await resolveReportConflict(
        { db: handle.db, clock, newId: makeIdGen() },
        "id-1",
        "keep_mine",
      );
      const r = await getReport(handle.db, "id-1");
      expect(r?.sync_state).toBe("dirty");
      expect(r?.report_data).toEqual({ meta: { title: "Local" } });
      expect(r?.server_updated_at).toBe("2026-04-27T00:00:05Z");
      const outbox = await handle.db.all<OutboxRow>("SELECT * FROM outbox");
      expect(outbox).toHaveLength(1);
      expect(outbox[0]?.op).toBe("update");
      expect(outbox[0]?.base_version).toBe("2026-04-27T00:00:05Z");
    } finally {
      handle.close();
    }
  });
});

describe("resolveReportConflict — use_server", () => {
  it("overwrites local with server snapshot and clears pending outbox", async () => {
    const handle = openInMemoryDb();
    try {
      await setupConflictedReport(handle);
      // Seed an unrelated extra outbox row to verify scope-limited delete.
      await handle.db.exec(
        `INSERT INTO outbox (entity, entity_id, op, payload_json, attempts,
          next_attempt_at, client_op_id, created_at)
         VALUES ('project','px','update','{}',0,?,?,?)`,
        ["2026-04-27T00:00:00Z", "extra-1", "2026-04-27T00:00:00Z"],
      );

      await resolveReportConflict(
        { db: handle.db, clock, newId: makeIdGen() },
        "id-1",
        "use_server",
      );
      const r = await getReport(handle.db, "id-1");
      expect(r?.sync_state).toBe("synced");
      expect(r?.title).toBe("Server Title");
      expect(r?.report_data).toEqual({
        meta: { title: "Server Title", summary: "S" },
      });
      expect(r?.notes).toEqual([{ id: "n1", text: "from server" }]);
      const outbox = await handle.db.all<OutboxRow>(
        "SELECT * FROM outbox ORDER BY id",
      );
      expect(outbox).toHaveLength(1);
      expect(outbox[0]?.entity).toBe("project");
    } finally {
      handle.close();
    }
  });

  it("is a no-op when there is no stashed snapshot", async () => {
    const handle = openInMemoryDb();
    try {
      await runMigrations(handle.db);
      const newId = makeIdGen();
      await createReport(
        { db: handle.db, clock, newId },
        { projectId: "p1", ownerId: "u1" },
      );
      await expect(
        resolveReportConflict(
          { db: handle.db, clock, newId },
          "id-1",
          "use_server",
        ),
      ).resolves.toBeUndefined();
    } finally {
      handle.close();
    }
  });
});
