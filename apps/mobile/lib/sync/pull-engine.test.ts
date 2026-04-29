import { describe, it, expect } from "vitest";

import { openInMemoryDb } from "../local-db/better-sqlite-adapter";
import { runMigrations } from "../local-db/run-migrations";
import { listProjects, getProject } from "../local-db/repositories/projects-repo";
import { listReports, getReport } from "../local-db/repositories/reports-repo";
import {
  PROJECTS_PULLABLE,
  PROJECT_MEMBERS_PULLABLE,
  REPORTS_PULLABLE,
  pullTable,
  type Fetcher,
  type PullRow,
} from "./pull-engine";

const TS = (n: number) => `2026-04-27T00:00:0${n}Z`;

function fetcherFromBatches(batches: PullRow[][]): Fetcher {
  let i = 0;
  return async () => {
    const batch = batches[i] ?? [];
    i += 1;
    return batch;
  };
}

describe("pullTable — projects", () => {
  it("inserts new rows and advances the cursor", async () => {
    const handle = openInMemoryDb();
    try {
      await runMigrations(handle.db);
      const fetcher = fetcherFromBatches([
        [
          {
            id: "p1",
            owner_id: "u1",
            name: "Site A",
            address: null,
            client_name: null,
            status: "active",
            created_at: TS(1),
            updated_at: TS(1),
            deleted_at: null,
          },
          {
            id: "p2",
            owner_id: "u1",
            name: "Site B",
            address: null,
            client_name: null,
            status: "active",
            created_at: TS(2),
            updated_at: TS(2),
            deleted_at: null,
          },
        ],
      ]);

      const result = await pullTable({
        db: handle.db,
        fetcher,
        userId: "u1",
        table: PROJECTS_PULLABLE,
      });

      expect(result).toEqual({
        table: "projects",
        rowsApplied: 2,
        rowsSkippedDirty: 0,
        newCursor: TS(2),
      });
      const list = await listProjects(handle.db, { ownerId: "u1" });
      expect(list.map((r) => r.id)).toEqual(["p2", "p1"]);
      expect(list[0]?.sync_state).toBe("synced");
      expect(list[0]?.server_updated_at).toBe(TS(2));
    } finally {
      handle.close();
    }
  });

  it("respects soft-deletes from the server", async () => {
    const handle = openInMemoryDb();
    try {
      await runMigrations(handle.db);
      await pullTable({
        db: handle.db,
        fetcher: fetcherFromBatches([
          [
            {
              id: "p1",
              owner_id: "u1",
              name: "Site A",
              address: null,
              client_name: null,
              status: "active",
              created_at: TS(1),
              updated_at: TS(1),
              deleted_at: null,
            },
          ],
        ]),
        userId: "u1",
        table: PROJECTS_PULLABLE,
      });

      // Server soft-deletes the project.
      await pullTable({
        db: handle.db,
        fetcher: fetcherFromBatches([
          [
            {
              id: "p1",
              owner_id: "u1",
              name: "Site A",
              address: null,
              client_name: null,
              status: "active",
              created_at: TS(1),
              updated_at: TS(2),
              deleted_at: TS(2),
            },
          ],
        ]),
        userId: "u1",
        table: PROJECTS_PULLABLE,
      });

      const visible = await listProjects(handle.db, { ownerId: "u1" });
      expect(visible).toEqual([]);
      const all = await listProjects(handle.db, {
        ownerId: "u1",
        includeDeleted: true,
      });
      expect(all).toHaveLength(1);
      expect(all[0]?.deleted_at).toBe(TS(2));
    } finally {
      handle.close();
    }
  });

  it("does not overwrite locally-dirty rows", async () => {
    const handle = openInMemoryDb();
    try {
      await runMigrations(handle.db);
      // Seed a dirty local edit.
      await handle.db.exec(
        `INSERT INTO projects (id, owner_id, name, status, created_at,
          updated_at, local_updated_at, sync_state)
         VALUES (?,?,?,?,?,?,?,?)`,
        [
          "p1", "u1", "Local Name", "active", TS(1), TS(1), TS(3), "dirty",
        ],
      );

      const result = await pullTable({
        db: handle.db,
        fetcher: fetcherFromBatches([
          [
            {
              id: "p1",
              owner_id: "u1",
              name: "Server Name",
              address: null,
              client_name: null,
              status: "active",
              created_at: TS(1),
              updated_at: TS(2),
              deleted_at: null,
            },
          ],
        ]),
        userId: "u1",
        table: PROJECTS_PULLABLE,
      });

      expect(result.rowsApplied).toBe(0);
      expect(result.rowsSkippedDirty).toBe(1);
      const row = await getProject(handle.db, "p1");
      expect(row?.name).toBe("Local Name");
      expect(row?.sync_state).toBe("dirty");
    } finally {
      handle.close();
    }
  });

  it("rerunning with the cursor up-to-date is a no-op", async () => {
    const handle = openInMemoryDb();
    try {
      await runMigrations(handle.db);
      const rows: PullRow[] = [
        {
          id: "p1",
          owner_id: "u1",
          name: "A",
          address: null,
          client_name: null,
          status: "active",
          created_at: TS(1),
          updated_at: TS(1),
          deleted_at: null,
        },
      ];
      await pullTable({
        db: handle.db,
        fetcher: fetcherFromBatches([rows]),
        userId: "u1",
        table: PROJECTS_PULLABLE,
      });
      // Second pull returns nothing past cursor.
      const second = await pullTable({
        db: handle.db,
        fetcher: fetcherFromBatches([[]]),
        userId: "u1",
        table: PROJECTS_PULLABLE,
      });
      expect(second.rowsApplied).toBe(0);
      expect(second.newCursor).toBe(TS(1));
    } finally {
      handle.close();
    }
  });

  it("pages through results when batch is full", async () => {
    const handle = openInMemoryDb();
    try {
      await runMigrations(handle.db);
      const rows1: PullRow[] = Array.from({ length: 2 }, (_, i) => ({
        id: `p${i}`,
        owner_id: "u1",
        name: `n${i}`,
        address: null,
        client_name: null,
        status: "active",
        created_at: TS(1),
        updated_at: TS(i + 1),
        deleted_at: null,
      }));
      const rows2: PullRow[] = [
        {
          id: "p2",
          owner_id: "u1",
          name: "n2",
          address: null,
          client_name: null,
          status: "active",
          created_at: TS(1),
          updated_at: TS(3),
          deleted_at: null,
        },
      ];

      const calls: Array<string | null> = [];
      const fetcher: Fetcher = async (_table, cursor, limit) => {
        calls.push(cursor);
        return cursor === null ? rows1 : limit === 2 ? rows2 : [];
      };

      const result = await pullTable({
        db: handle.db,
        fetcher,
        userId: "u1",
        table: PROJECTS_PULLABLE,
        limit: 2,
      });

      expect(result.rowsApplied).toBe(3);
      expect(calls.length).toBeGreaterThanOrEqual(2);
      expect(calls[1]).toBe(TS(2));
    } finally {
      handle.close();
    }
  });
});

describe("pullTable — reports (jsonb fields stringified)", () => {
  it("stringifies notes and report_data into TEXT columns", async () => {
    const handle = openInMemoryDb();
    try {
      await runMigrations(handle.db);
      await pullTable({
        db: handle.db,
        fetcher: fetcherFromBatches([
          [
            {
              id: "r1",
              project_id: "p1",
              owner_id: "u1",
              title: "Daily 1",
              report_type: "daily",
              status: "draft",
              visit_date: "2026-04-27",
              confidence: null,
              notes: [{ id: "n1", text: "hello" }],
              report_data: { meta: { title: "Daily 1" } },
              created_at: TS(1),
              updated_at: TS(1),
              deleted_at: null,
            },
          ],
        ]),
        userId: "u1",
        table: REPORTS_PULLABLE,
      });

      const list = await listReports(handle.db, { projectId: "p1" });
      expect(list).toHaveLength(1);
      const r = list[0]!;
      expect(r.title).toBe("Daily 1");
      expect(r.notes).toEqual([{ id: "n1", text: "hello" }]);
      expect(r.report_data).toEqual({ meta: { title: "Daily 1" } });
      expect(r.sync_state).toBe("synced");
      const direct = await getReport(handle.db, "r1");
      expect(direct?.id).toBe("r1");
    } finally {
      handle.close();
    }
  });
});

describe("pullTable — project_members (composite PK)", () => {
  // Regression for the C2 bug: project_members has PK (project_id, user_id)
  // and no `id` column, so the previous `ON CONFLICT(id)` clause threw on
  // the first non-empty pull batch.
  it("upserts rows by composite key", async () => {
    const handle = openInMemoryDb();
    try {
      await runMigrations(handle.db);
      const fetcher = fetcherFromBatches([
        [
          {
            project_id: "p1",
            user_id: "u1",
            role: "owner",
            created_at: TS(1),
            updated_at: TS(1),
            deleted_at: null,
          } as PullRow,
          {
            project_id: "p1",
            user_id: "u2",
            role: "editor",
            created_at: TS(2),
            updated_at: TS(2),
            deleted_at: null,
          } as PullRow,
        ],
      ]);

      const result = await pullTable({
        db: handle.db,
        fetcher,
        userId: "u1",
        table: PROJECT_MEMBERS_PULLABLE,
      });

      expect(result.rowsApplied).toBe(2);
      const rows = await handle.db.all<{
        project_id: string;
        user_id: string;
        role: string;
        sync_state: string;
      }>("SELECT project_id, user_id, role, sync_state FROM project_members ORDER BY user_id");
      expect(rows).toEqual([
        { project_id: "p1", user_id: "u1", role: "owner", sync_state: "synced" },
        { project_id: "p1", user_id: "u2", role: "editor", sync_state: "synced" },
      ]);
    } finally {
      handle.close();
    }
  });

  it("re-pull updates the role of an existing membership", async () => {
    const handle = openInMemoryDb();
    try {
      await runMigrations(handle.db);
      await pullTable({
        db: handle.db,
        fetcher: fetcherFromBatches([
          [
            {
              project_id: "p1",
              user_id: "u2",
              role: "viewer",
              created_at: TS(1),
              updated_at: TS(1),
              deleted_at: null,
            } as PullRow,
          ],
        ]),
        userId: "u1",
        table: PROJECT_MEMBERS_PULLABLE,
      });

      await pullTable({
        db: handle.db,
        fetcher: fetcherFromBatches([
          [
            {
              project_id: "p1",
              user_id: "u2",
              role: "editor",
              created_at: TS(1),
              updated_at: TS(2),
              deleted_at: null,
            } as PullRow,
          ],
        ]),
        userId: "u1",
        table: PROJECT_MEMBERS_PULLABLE,
      });

      const row = await handle.db.get<{ role: string }>(
        "SELECT role FROM project_members WHERE project_id = ? AND user_id = ?",
        ["p1", "u2"],
      );
      expect(row?.role).toBe("editor");
    } finally {
      handle.close();
    }
  });
});
