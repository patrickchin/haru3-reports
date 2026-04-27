import { describe, it, expect } from "vitest";

import { openInMemoryDb } from "./better-sqlite-adapter";
import { MIGRATIONS, SCHEMA_VERSION, type Migration } from "./migrations";
import { runMigrations } from "./run-migrations";

async function userVersion(db: {
  get: <T>(s: string) => Promise<T | null>;
}): Promise<number> {
  const row = await db.get<{ user_version: number }>("PRAGMA user_version");
  return row?.user_version ?? 0;
}

describe("runMigrations", () => {
  it("applies all migrations from a fresh database", async () => {
    const handle = openInMemoryDb();
    try {
      const result = await runMigrations(handle.db);
      expect(result.fromVersion).toBe(0);
      expect(result.toVersion).toBe(SCHEMA_VERSION);
      expect(result.applied).toEqual(MIGRATIONS.map((m) => m.version));
      expect(await userVersion(handle.db)).toBe(SCHEMA_VERSION);
    } finally {
      handle.close();
    }
  });

  it("creates the expected v1 tables", async () => {
    const handle = openInMemoryDb();
    try {
      await runMigrations(handle.db);
      const rows = await handle.db.all<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
      );
      const names = rows.map((r) => r.name);
      expect(names).toEqual(
        expect.arrayContaining([
          "projects",
          "project_members",
          "reports",
          "file_metadata",
          "outbox",
          "generation_jobs",
          "sync_meta",
          "sync_events",
        ]),
      );
    } finally {
      handle.close();
    }
  });

  it("is idempotent — re-running applies nothing", async () => {
    const handle = openInMemoryDb();
    try {
      await runMigrations(handle.db);
      const second = await runMigrations(handle.db);
      expect(second.fromVersion).toBe(SCHEMA_VERSION);
      expect(second.applied).toEqual([]);
    } finally {
      handle.close();
    }
  });

  it("only applies pending migrations when partially up to date", async () => {
    const m1: Migration = {
      version: 1,
      name: "first",
      sql: "CREATE TABLE a (id INTEGER PRIMARY KEY)",
    };
    const m2: Migration = {
      version: 2,
      name: "second",
      sql: "CREATE TABLE b (id INTEGER PRIMARY KEY)",
    };

    const handle = openInMemoryDb();
    try {
      await runMigrations(handle.db, [m1]);
      const result = await runMigrations(handle.db, [m1, m2]);
      expect(result.fromVersion).toBe(1);
      expect(result.applied).toEqual([2]);

      const tables = await handle.db.all<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
      );
      expect(tables.map((t) => t.name)).toEqual(["a", "b"]);
    } finally {
      handle.close();
    }
  });

  it("rolls back when a migration fails — schema and version unchanged", async () => {
    const ok: Migration = {
      version: 1,
      name: "ok",
      sql: "CREATE TABLE ok (id INTEGER PRIMARY KEY)",
    };
    const broken: Migration = {
      version: 2,
      name: "broken",
      sql: "CREATE TABLE bad (id INTEGER PRIMARY KEY); CREATE TABLE bad (id INTEGER PRIMARY KEY)",
    };

    const handle = openInMemoryDb();
    try {
      await expect(runMigrations(handle.db, [ok, broken])).rejects.toThrow();

      // First migration committed; second rolled back.
      expect(await userVersion(handle.db)).toBe(1);
      const tables = await handle.db.all<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
      );
      expect(tables.map((t) => t.name)).toEqual(["ok"]);
    } finally {
      handle.close();
    }
  });

  it("refuses to downgrade when DB is newer than the build", async () => {
    const handle = openInMemoryDb();
    try {
      await handle.db.exec("PRAGMA user_version = 99");
      await expect(runMigrations(handle.db)).rejects.toThrow(
        /Refusing to downgrade/,
      );
    } finally {
      handle.close();
    }
  });

  it("rejects non-monotonic migration versions", async () => {
    const handle = openInMemoryDb();
    try {
      await expect(
        runMigrations(handle.db, [
          { version: 1, name: "a", sql: "CREATE TABLE a(id INTEGER PRIMARY KEY)" },
          { version: 1, name: "dup", sql: "CREATE TABLE b(id INTEGER PRIMARY KEY)" },
        ]),
      ).rejects.toThrow(/strictly increase/);
    } finally {
      handle.close();
    }
  });

  it("rejects non-positive migration versions", async () => {
    const handle = openInMemoryDb();
    try {
      await expect(
        runMigrations(handle.db, [
          { version: 0, name: "zero", sql: "CREATE TABLE z(id INTEGER PRIMARY KEY)" },
        ]),
      ).rejects.toThrow(/invalid version/);
    } finally {
      handle.close();
    }
  });
});

describe("v1 schema shape", () => {
  it("reports table accepts a row with all sync columns", async () => {
    const handle = openInMemoryDb();
    try {
      await runMigrations(handle.db);
      await handle.db.exec(
        `INSERT INTO reports (
          id, project_id, owner_id, title, report_type, status,
          notes_json, report_data_json, generation_state,
          created_at, updated_at, local_updated_at, sync_state
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          "r1", "p1", "u1", "T", "daily", "draft",
          "[]", "{}", "idle",
          "2026-04-27T00:00:00Z", "2026-04-27T00:00:00Z",
          "2026-04-27T00:00:00Z", "dirty",
        ],
      );
      const row = await handle.db.get<{
        id: string;
        sync_state: string;
        notes_json: string;
      }>("SELECT id, sync_state, notes_json FROM reports WHERE id = ?", [
        "r1",
      ]);
      expect(row).toEqual({ id: "r1", sync_state: "dirty", notes_json: "[]" });
    } finally {
      handle.close();
    }
  });

  it("outbox enforces unique client_op_id", async () => {
    const handle = openInMemoryDb();
    try {
      await runMigrations(handle.db);
      const insert = (op: string) =>
        handle.db.exec(
          `INSERT INTO outbox (entity, entity_id, op, payload_json,
            next_attempt_at, client_op_id, created_at)
           VALUES ('report','r1',?,'{}','2026-04-27T00:00:00Z','op-1','2026-04-27T00:00:00Z')`,
          [op],
        );
      await insert("update");
      await expect(insert("update")).rejects.toThrow();
    } finally {
      handle.close();
    }
  });
});
