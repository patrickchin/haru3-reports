import { describe, it, expect } from "vitest";

import { openInMemoryDb } from "../better-sqlite-adapter";
import { runMigrations } from "../run-migrations";
import {
  createReport,
  getReport,
  REPORT_DATA_SCHEMA_VERSION,
  softDeleteReport,
  updateReport,
} from "./reports-repo";
import type { OutboxRow } from "../../sync/outbox";

const clock = () => "2026-04-27T00:00:00Z";
function makeIdGen() {
  let i = 0;
  return () => `id-${++i}`;
}

describe("reports-repo write side", () => {
  it("createReport persists row + outbox insert", async () => {
    const handle = openInMemoryDb();
    try {
      await runMigrations(handle.db);
      const newId = makeIdGen();
      const created = await createReport(
        { db: handle.db, clock, newId },
        { projectId: "p1", ownerId: "u1", title: "T" },
      );
      expect(created.id).toBe("id-1");
      const got = await getReport(handle.db, "id-1");
      expect(got?.title).toBe("T");
      expect(got?.notes).toEqual([]);
      expect(got?.report_data).toEqual({});
      const outbox = await handle.db.all<OutboxRow>("SELECT * FROM outbox");
      expect(outbox).toHaveLength(1);
      expect(outbox[0]?.entity).toBe("report");
      expect(outbox[0]?.op).toBe("insert");
    } finally {
      handle.close();
    }
  });

  it("updateReport stringifies notes and report_data", async () => {
    const handle = openInMemoryDb();
    try {
      await runMigrations(handle.db);
      const newId = makeIdGen();
      await createReport(
        { db: handle.db, clock, newId },
        { projectId: "p1", ownerId: "u1" },
      );
      await updateReport(
        { db: handle.db, clock, newId },
        "id-1",
        {
          notes: [{ id: "n1", text: "hi" }],
          report_data: { meta: { title: "X" } },
        },
      );
      const got = await getReport(handle.db, "id-1");
      expect(got?.notes).toEqual([{ id: "n1", text: "hi" }]);
      expect(got?.report_data).toEqual({
        meta: { title: "X" },
        _schemaVersion: 1,
      });
    } finally {
      handle.close();
    }
  });

  it("updateReport stamps report_data._schemaVersion on every write", async () => {
    const handle = openInMemoryDb();
    try {
      await runMigrations(handle.db);
      const newId = makeIdGen();
      await createReport(
        { db: handle.db, clock, newId },
        { projectId: "p1", ownerId: "u1" },
      );
      await updateReport(
        { db: handle.db, clock, newId },
        "id-1",
        { report_data: { meta: { title: "Y" } } },
      );
      const got = await getReport(handle.db, "id-1");
      expect(got?.report_data._schemaVersion).toBe(REPORT_DATA_SCHEMA_VERSION);
    } finally {
      handle.close();
    }
  });

  it("softDeleteReport enqueues delete and hides row", async () => {
    const handle = openInMemoryDb();
    try {
      await runMigrations(handle.db);
      const newId = makeIdGen();
      await createReport(
        { db: handle.db, clock, newId },
        { projectId: "p1", ownerId: "u1" },
      );
      await softDeleteReport({ db: handle.db, clock, newId }, "id-1");
      const got = await getReport(handle.db, "id-1");
      expect(got?.deleted_at).not.toBeNull();
      const outbox = await handle.db.all<OutboxRow>("SELECT * FROM outbox");
      // Insert + Delete coalesce — DELETE supersedes the queued insert.
      expect(outbox).toHaveLength(1);
      expect(outbox[0]?.op).toBe("delete");
    } finally {
      handle.close();
    }
  });
});
