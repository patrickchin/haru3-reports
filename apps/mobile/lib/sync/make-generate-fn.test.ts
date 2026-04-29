import { describe, it, expect, vi } from "vitest";

import { openInMemoryDb } from "../local-db/better-sqlite-adapter";
import { runMigrations } from "../local-db/run-migrations";
import { isoClock, randomId } from "../local-db/clock";
import { createReport } from "../local-db/repositories/reports-repo";
import { makeGenerateFn } from "./make-generate-fn";

const NOW = "2026-04-30T00:00:00Z";

async function setup() {
  const h = openInMemoryDb();
  await runMigrations(h.db);
  await h.db.exec(
    `INSERT INTO projects (id, owner_id, name, status, created_at, updated_at, local_updated_at, sync_state)
     VALUES (?,?,?,?,?,?,?,?)`,
    ["p1", "u1", "P", "active", NOW, NOW, NOW, "synced"],
  );
  return h;
}

const VALID_REPORT = {
  report: {
    meta: { title: "My Report", reportType: "daily", summary: "ok" },
  },
};

describe("makeGenerateFn", () => {
  it("invokes the edge function with notes + projectId and writes back report_data", async () => {
    const h = await setup();
    try {
      const r = await createReport(
        { db: h.db, clock: isoClock, newId: randomId },
        { projectId: "p1", ownerId: "u1", title: "T" },
      );
      // Seed report_notes rows instead of legacy notes_json.
      const seedNow = "2026-04-30T00:00:00Z";
      await h.db.exec(
        `INSERT INTO report_notes (id, report_id, project_id, author_id, position, kind, body, created_at, updated_at, local_updated_at, sync_state)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        ["n1", r.id, "p1", "u1", 1, "text", "a", seedNow, seedNow, seedNow, "synced"],
      );
      await h.db.exec(
        `INSERT INTO report_notes (id, report_id, project_id, author_id, position, kind, body, created_at, updated_at, local_updated_at, sync_state)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        ["n2", r.id, "p1", "u1", 2, "text", "b", seedNow, seedNow, seedNow, "synced"],
      );
      const invoke = vi.fn(async () => ({
        data: VALID_REPORT,
        error: null,
      }));
      const generate = makeGenerateFn({
        db: h.db,
        backend: { functions: { invoke } } as never,
        clock: isoClock,
        newId: randomId,
      });
      const out = await generate({ reportId: r.id });
      expect(out).toEqual({ ok: true });
      expect(invoke).toHaveBeenCalledWith("generate-report", {
        body: expect.objectContaining({
          notes: ["a", "b"],
          projectId: "p1",
        }),
      });
      // Outbox should contain a row that carries the new report_data
      // (it may coalesce into the pending create from createReport).
      const outbox = await h.db.all<{
        entity: string;
        entity_id: string;
        op: string;
        payload_json: string;
      }>(
        "SELECT entity, entity_id, op, payload_json FROM outbox WHERE entity_id = ?",
        [r.id],
      );
      expect(outbox.length).toBeGreaterThan(0);
      const carriesData = outbox.some((row) =>
        row.payload_json.includes("\"My Report\""),
      );
      expect(carriesData).toBe(true);
    } finally {
      h.close();
    }
  });

  it("includes existingReport in the body when report_data is non-empty", async () => {
    const h = await setup();
    try {
      const r = await createReport(
        { db: h.db, clock: isoClock, newId: randomId },
        { projectId: "p1", ownerId: "u1", title: "T" },
      );
      await h.db.exec(
        "UPDATE reports SET report_data_json = ? WHERE id = ?",
        [JSON.stringify({ summary: "prev" }), r.id],
      );
      const invoke = vi.fn(
        async (_name: string, _opts: { body: Record<string, unknown> }) => ({
          data: VALID_REPORT,
          error: null,
        }),
      );
      const generate = makeGenerateFn({
        db: h.db,
        backend: { functions: { invoke } } as never,
        clock: isoClock,
        newId: randomId,
      });
      await generate({ reportId: r.id });
      const body = invoke.mock.calls[0][1].body;
      expect(body.existingReport).toEqual({ summary: "prev" });
    } finally {
      h.close();
    }
  });

  it("throws when the edge function returns an error so the driver retries", async () => {
    const h = await setup();
    try {
      const r = await createReport(
        { db: h.db, clock: isoClock, newId: randomId },
        { projectId: "p1", ownerId: "u1", title: "T" },
      );
      const invoke = vi.fn(async () => ({
        data: null,
        error: Object.assign(new Error("boom"), { status: 500 }),
      }));
      const generate = makeGenerateFn({
        db: h.db,
        backend: { functions: { invoke } } as never,
        clock: isoClock,
        newId: randomId,
      });
      await expect(generate({ reportId: r.id })).rejects.toThrow(/HTTP 500/);
    } finally {
      h.close();
    }
  });

  it("returns ok=false when the report has been deleted locally", async () => {
    const h = await setup();
    try {
      const invoke = vi.fn();
      const generate = makeGenerateFn({
        db: h.db,
        backend: { functions: { invoke } } as never,
        clock: isoClock,
        newId: randomId,
      });
      const out = await generate({ reportId: "missing" });
      expect(out).toEqual({ ok: false });
      expect(invoke).not.toHaveBeenCalled();
    } finally {
      h.close();
    }
  });

  it("rejects unrecognized payload shapes from the edge function", async () => {
    const h = await setup();
    try {
      const r = await createReport(
        { db: h.db, clock: isoClock, newId: randomId },
        { projectId: "p1", ownerId: "u1", title: "T" },
      );
      const invoke = vi.fn(async () => ({ data: { random: "junk" }, error: null }));
      const generate = makeGenerateFn({
        db: h.db,
        backend: { functions: { invoke } } as never,
        clock: isoClock,
        newId: randomId,
      });
      await expect(generate({ reportId: r.id })).rejects.toThrow(/schema/);
    } finally {
      h.close();
    }
  });
});
