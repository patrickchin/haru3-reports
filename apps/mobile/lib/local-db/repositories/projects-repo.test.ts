import { describe, it, expect } from "vitest";

import { openInMemoryDb } from "../better-sqlite-adapter";
import { runMigrations } from "../run-migrations";
import {
  createProject,
  getProject,
  listAccessibleProjects,
  listMemberRoles,
  listProjects,
  softDeleteProject,
  updateProject,
} from "./projects-repo";
import type { OutboxRow } from "../../sync/outbox";

const TS = "2026-04-27T00:00:00Z";
const clock = () => TS;

function makeIdGen() {
  let i = 0;
  return () => `id-${++i}`;
}

describe("projects-repo write side", () => {
  it("createProject writes row + outbox insert atomically", async () => {
    const handle = openInMemoryDb();
    try {
      await runMigrations(handle.db);
      const newId = makeIdGen();
      const created = await createProject(
        { db: handle.db, clock, newId },
        { ownerId: "u1", name: "Alpha" },
      );
      expect(created.id).toBe("id-1");
      expect(created.sync_state).toBe("dirty");
      const got = await getProject(handle.db, "id-1");
      expect(got?.name).toBe("Alpha");
      const outbox = await handle.db.all<OutboxRow>("SELECT * FROM outbox");
      expect(outbox).toHaveLength(1);
      expect(outbox[0]?.entity).toBe("project");
      expect(outbox[0]?.op).toBe("insert");
      expect(JSON.parse(outbox[0]!.payload_json)).toMatchObject({
        id: "id-1",
        name: "Alpha",
      });
      // owner_id is intentionally NOT in the payload — the server RPC
      // forces it to auth.uid().
      expect(JSON.parse(outbox[0]!.payload_json)).not.toHaveProperty(
        "owner_id",
      );
    } finally {
      handle.close();
    }
  });

  it("updateProject coalesces with the prior insert (single outbox row)", async () => {
    const handle = openInMemoryDb();
    try {
      await runMigrations(handle.db);
      const newId = makeIdGen();
      await createProject(
        { db: handle.db, clock, newId },
        { ownerId: "u1", name: "Alpha" },
      );
      await updateProject(
        { db: handle.db, clock, newId },
        "id-1",
        { name: "Beta" },
      );
      const got = await getProject(handle.db, "id-1");
      expect(got?.name).toBe("Beta");
      const outbox = await handle.db.all<OutboxRow>("SELECT * FROM outbox");
      expect(outbox).toHaveLength(1);
      expect(outbox[0]?.op).toBe("insert");
      expect(JSON.parse(outbox[0]!.payload_json)).toMatchObject({
        name: "Beta",
      });
    } finally {
      handle.close();
    }
  });

  it("softDeleteProject hides from list + enqueues delete", async () => {
    const handle = openInMemoryDb();
    try {
      await runMigrations(handle.db);
      const newId = makeIdGen();
      await createProject(
        { db: handle.db, clock, newId },
        { ownerId: "u1", name: "Alpha" },
      );
      // Mark as already pulled to verify base_version flows through.
      await handle.db.exec(
        "UPDATE projects SET server_updated_at = ?, sync_state = 'synced' WHERE id = 'id-1'",
        ["2026-04-27T00:00:01Z"],
      );
      await handle.db.exec("DELETE FROM outbox");

      await softDeleteProject({ db: handle.db, clock, newId }, "id-1");
      const visible = await listProjects(handle.db, { ownerId: "u1" });
      expect(visible).toEqual([]);
      const outbox = await handle.db.all<OutboxRow>("SELECT * FROM outbox");
      expect(outbox).toHaveLength(1);
      expect(outbox[0]?.op).toBe("delete");
      expect(outbox[0]?.base_version).toBe("2026-04-27T00:00:01Z");
    } finally {
      handle.close();
    }
  });

  it("updateProject throws if project does not exist (rolls back)", async () => {
    const handle = openInMemoryDb();
    try {
      await runMigrations(handle.db);
      const newId = makeIdGen();
      await expect(
        updateProject(
          { db: handle.db, clock, newId },
          "missing",
          { name: "x" },
        ),
      ).rejects.toThrow(/not found/);
      const outbox = await handle.db.all<OutboxRow>("SELECT * FROM outbox");
      expect(outbox).toHaveLength(0);
    } finally {
      handle.close();
    }
  });

  it("listAccessibleProjects returns all non-deleted rows regardless of owner", async () => {
    const handle = openInMemoryDb();
    try {
      await runMigrations(handle.db);
      // Insert two rows directly: one owned by u1, one by u2 (e.g. shared
      // via membership). Local mirror is per-user so RLS already filtered.
      await handle.db.exec(
        `INSERT INTO projects (id, owner_id, name, status, created_at, updated_at, local_updated_at, sync_state)
         VALUES (?,?,?,?,?,?,?,?)`,
        ["pa", "u1", "A", "active", TS, TS, TS, "synced"],
      );
      await handle.db.exec(
        `INSERT INTO projects (id, owner_id, name, status, created_at, updated_at, local_updated_at, sync_state)
         VALUES (?,?,?,?,?,?,?,?)`,
        ["pb", "u2", "B", "active", TS, TS, TS, "synced"],
      );
      const rows = await listAccessibleProjects(handle.db);
      expect(rows.map((r) => r.id).sort()).toEqual(["pa", "pb"]);
    } finally {
      handle.close();
    }
  });

  it("listMemberRoles returns map keyed by project for the given user", async () => {
    const handle = openInMemoryDb();
    try {
      await runMigrations(handle.db);
      await handle.db.exec(
        `INSERT INTO project_members (project_id, user_id, role, created_at, updated_at, local_updated_at, sync_state)
         VALUES (?,?,?,?,?,?,?)`,
        ["pa", "u1", "owner", TS, TS, TS, "synced"],
      );
      await handle.db.exec(
        `INSERT INTO project_members (project_id, user_id, role, created_at, updated_at, local_updated_at, sync_state)
         VALUES (?,?,?,?,?,?,?)`,
        ["pb", "u1", "editor", TS, TS, TS, "synced"],
      );
      await handle.db.exec(
        `INSERT INTO project_members (project_id, user_id, role, created_at, updated_at, local_updated_at, sync_state)
         VALUES (?,?,?,?,?,?,?)`,
        ["pc", "u2", "viewer", TS, TS, TS, "synced"],
      );
      const roles = await listMemberRoles(handle.db, "u1");
      expect(roles.get("pa")).toBe("owner");
      expect(roles.get("pb")).toBe("editor");
      expect(roles.has("pc")).toBe(false);
    } finally {
      handle.close();
    }
  });
});
