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
      expect(got?.report_data).toEqual({});
      const outbox = await handle.db.all<OutboxRow>("SELECT * FROM outbox");
      expect(outbox).toHaveLength(1);
      expect(outbox[0]?.entity).toBe("report");
      expect(outbox[0]?.op).toBe("insert");
    } finally {
      handle.close();
    }
  });

  it("updateReport stringifies report_data", async () => {
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
          report_data: { meta: { title: "X" } },
        },
      );
      const got = await getReport(handle.db, "id-1");
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

  it("updateReport throws when the report row does not exist", async () => {
    const handle = openInMemoryDb();
    try {
      await runMigrations(handle.db);
      const newId = makeIdGen();
      await expect(
        updateReport(
          { db: handle.db, clock, newId },
          "missing-id",
          { title: "x" },
        ),
      ).rejects.toThrow(/missing-id not found/);
    } finally {
      handle.close();
    }
  });

  it("updateReport stringifies last_generation when set and stores NULL when cleared", async () => {
    const handle = openInMemoryDb();
    try {
      await runMigrations(handle.db);
      const newId = makeIdGen();
      await createReport(
        { db: handle.db, clock, newId },
        { projectId: "p1", ownerId: "u1" },
      );
      // Set last_generation to a real object — exercises the JSON.stringify branch.
      await updateReport(
        { db: handle.db, clock, newId },
        "id-1",
        { last_generation: { provider: "openai", model: "gpt" } },
      );
      const got1 = await getReport(handle.db, "id-1");
      expect(got1?.last_generation).toEqual({ provider: "openai", model: "gpt" });
      // Clear it — exercises the `v == null ? null` branch.
      await updateReport(
        { db: handle.db, clock, newId },
        "id-1",
        { last_generation: null },
      );
      const got2 = await getReport(handle.db, "id-1");
      expect(got2?.last_generation).toBeNull();
    } finally {
      handle.close();
    }
  });

  it("getReport returns empty object/null for malformed JSON columns (parse-fallback branches)", async () => {
    const handle = openInMemoryDb();
    try {
      await runMigrations(handle.db);
      const newId = makeIdGen();
      await createReport(
        { db: handle.db, clock, newId },
        { projectId: "p1", ownerId: "u1" },
      );
      // Corrupt both JSON columns directly so the boundary parsers hit
      // their catch{} branches on read.
      await handle.db.exec(
        `UPDATE reports
         SET report_data_json = '{not valid json',
             last_generation_json = '{also broken'
         WHERE id = ?`,
        ["id-1"],
      );
      const got = await getReport(handle.db, "id-1");
      // parseJsonObject -> {}, parseJsonObjectOrNull -> null on parse failure.
      expect(got?.report_data).toEqual({});
      expect(got?.last_generation).toBeNull();
    } finally {
      handle.close();
    }
  });

  it("getReport coerces non-object JSON (array) to {} / null via the type-guard branches", async () => {
    const handle = openInMemoryDb();
    try {
      await runMigrations(handle.db);
      const newId = makeIdGen();
      await createReport(
        { db: handle.db, clock, newId },
        { projectId: "p1", ownerId: "u1" },
      );
      // Valid JSON but an array — the parsers' `!Array.isArray(v)` and
      // typeof guards must reject it.
      await handle.db.exec(
        `UPDATE reports
         SET report_data_json = '[1,2,3]',
             last_generation_json = '"a string"'
         WHERE id = ?`,
        ["id-1"],
      );
      const got = await getReport(handle.db, "id-1");
      expect(got?.report_data).toEqual({});
      expect(got?.last_generation).toBeNull();
    } finally {
      handle.close();
    }
  });

  it("updateReport stamps {} when report_data is null/undefined (?? fallback)", async () => {
    const handle = openInMemoryDb();
    try {
      await runMigrations(handle.db);
      const newId = makeIdGen();
      await createReport(
        { db: handle.db, clock, newId },
        { projectId: "p1", ownerId: "u1" },
      );
      // Cast lets us send null through the typed signature to trigger
      // the `(v ?? {})` fallback in the production code.
      await updateReport(
        { db: handle.db, clock, newId },
        "id-1",
        { report_data: null as unknown as Record<string, unknown> },
      );
      const got = await getReport(handle.db, "id-1");
      // Empty object stamped with the schema version.
      expect(got?.report_data).toEqual({ _schemaVersion: 1 });
    } finally {
      handle.close();
    }
  });

  it("softDeleteReport silently no-ops when the report does not exist", async () => {
    const handle = openInMemoryDb();
    try {
      await runMigrations(handle.db);
      const newId = makeIdGen();
      // No createReport — the row simply does not exist.
      await expect(
        softDeleteReport({ db: handle.db, clock, newId }, "ghost-id"),
      ).resolves.toBeUndefined();
      const outbox = await handle.db.all<OutboxRow>("SELECT * FROM outbox");
      expect(outbox).toHaveLength(0);
    } finally {
      handle.close();
    }
  });
});
