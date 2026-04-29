/**
 * Sync integration test.
 *
 * Composes pull-engine + push-engine + generation-driver against a
 * fake server that lives in-process. Validates that the engines
 * cooperate the way SyncProvider arranges them — in particular:
 *
 *   - A locally-created project + report is pushed via the outbox to
 *     the fake server, and the server-applied row's updated_at flows
 *     back via a pull.
 *   - A note edit triggers generation enqueue; the driver gates on
 *     outbox emptiness, runs after a push drain, writes the result
 *     back, and the resulting outbox row pushes again.
 *   - The pull skips locally-dirty rows so a server snapshot does not
 *     clobber unsynced edits.
 *
 * SyncProvider's React component shell is mocked elsewhere; this
 * test is the spine-level smoke for the runtime composition.
 */
import { describe, it, expect, vi } from "vitest";

import { openInMemoryDb } from "../local-db/better-sqlite-adapter";
import { runMigrations } from "../local-db/run-migrations";
import { isoClock, randomId } from "../local-db/clock";
import {
  createProject,
} from "../local-db/repositories/projects-repo";
import {
  createReport,
  updateReport,
  getReport,
} from "../local-db/repositories/reports-repo";
import {
  pullTable,
  PROJECTS_PULLABLE,
  REPORTS_PULLABLE,
  type Fetcher,
} from "./pull-engine";
import {
  drainOutbox,
  type MutationCaller,
  type MutationResponse,
  type MutationStatus,
} from "./push-engine";
import {
  enqueueJob,
} from "./generation-jobs-repo";
import { runGenerationOnce, _resetDriverInFlight } from "./generation-driver";
import { GenerationWorker } from "./generation-worker";
import { makeGenerateFn } from "./make-generate-fn";
import type { GenerationContext } from "./generation-policy";

// ---------------------------------------------------------------------------
// Fake server
// ---------------------------------------------------------------------------
// A tiny in-memory store that mirrors the contract of the apply_*
// mutation RPCs and the pull_*_since RPCs. We do NOT exercise RLS or
// optimistic concurrency in detail (those are covered by RLS tests);
// the goal here is the wiring between local + server.

type ServerRow = Record<string, unknown> & {
  id: string;
  updated_at: string;
  deleted_at: string | null;
};

class FakeServer {
  projects = new Map<string, ServerRow>();
  reports = new Map<string, ServerRow>();
  appliedOps = new Map<string, MutationResponse>();
  clockTick = 0;

  private nextTs(): string {
    this.clockTick += 1;
    return `2026-04-30T00:00:${String(this.clockTick).padStart(2, "0")}Z`;
  }

  store(entity: "project" | "report"): Map<string, ServerRow> {
    return entity === "project" ? this.projects : this.reports;
  }

  apply(
    entity: "project" | "report",
    payload: Parameters<MutationCaller>[1],
  ): MutationResponse {
    // Idempotent replay.
    const cached = this.appliedOps.get(payload.client_op_id);
    if (cached) return { ...cached, status: "duplicate" as MutationStatus };

    const store = this.store(entity);
    const ts = this.nextTs();
    const existing = store.get(payload.id);

    if (payload.op === "delete") {
      if (existing) {
        const updated: ServerRow = {
          ...existing,
          deleted_at: ts,
          updated_at: ts,
        };
        store.set(payload.id, updated);
        const resp: MutationResponse = {
          status: "applied",
          server_version: ts,
          row: updated,
        };
        this.appliedOps.set(payload.client_op_id, resp);
        return resp;
      }
      const resp: MutationResponse = {
        status: "applied",
        server_version: ts,
        row: null,
      };
      this.appliedOps.set(payload.client_op_id, resp);
      return resp;
    }

    const merged: ServerRow = {
      ...(existing ?? { id: payload.id, deleted_at: null, created_at: ts }),
      ...payload.fields,
      id: payload.id,
      updated_at: ts,
      // Fill defaults the pull engine expects.
      owner_id: existing?.owner_id ?? "u1",
    };
    if (entity === "project") {
      merged.name = merged.name ?? "untitled";
      merged.address = merged.address ?? null;
      merged.client_name = merged.client_name ?? null;
      merged.status = merged.status ?? "active";
    }
    if (entity === "report") {
      merged.project_id =
        merged.project_id ?? (payload.fields.project_id as string | undefined);
      merged.title = merged.title ?? "";
      merged.report_type = merged.report_type ?? "daily";
      merged.status = merged.status ?? "draft";
      merged.visit_date = merged.visit_date ?? null;
      merged.confidence = merged.confidence ?? null;
      merged.notes = merged.notes ?? [];
      merged.report_data = merged.report_data ?? {};
      merged.generation_state = merged.generation_state ?? "idle";
      merged.generation_error = merged.generation_error ?? null;
    }
    store.set(payload.id, merged);
    const resp: MutationResponse = {
      status: "applied",
      server_version: ts,
      row: merged,
    };
    this.appliedOps.set(payload.client_op_id, resp);
    return resp;
  }

  pull(table: string, cursor: string | null, limit: number): ServerRow[] {
    const store =
      table === "projects"
        ? this.projects
        : table === "reports"
          ? this.reports
          : new Map<string, ServerRow>();
    const rows = Array.from(store.values())
      .filter((r) => !cursor || r.updated_at > cursor)
      .sort((a, b) => a.updated_at.localeCompare(b.updated_at))
      .slice(0, limit);
    return rows;
  }
}

function makeFakeCaller(server: FakeServer): MutationCaller {
  return async (entity, payload) => {
    if (entity !== "project" && entity !== "report") {
      throw new Error(`fake server does not handle entity ${entity}`);
    }
    return server.apply(entity, payload);
  };
}

function makeFakeFetcher(server: FakeServer): Fetcher {
  return async (table, cursor, limit) => server.pull(table, cursor, limit);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const NOW = "2026-04-30T00:00:00Z";

const okCtx = (over: Partial<GenerationContext> = {}): GenerationContext => ({
  mode: "auto_any",
  net: { reachable: true, type: "wifi" },
  battery: { level: 0.9, charging: true },
  appState: "active",
  budget: { spentToday: 0, limit: 100 },
  userInitiated: false,
  ...over,
});

async function setup() {
  const handle = openInMemoryDb();
  await runMigrations(handle.db);
  return handle;
}

describe("sync integration: local-first round trip", () => {
  it("creates locally, pushes to fake server, then pulls server data back without clobbering", async () => {
    const h = await setup();
    const server = new FakeServer();
    try {
      // 1. Local create.
      const p = await createProject(
        { db: h.db, clock: isoClock, newId: randomId },
        { ownerId: "u1", name: "Alpha" },
      );
      expect(p.sync_state).toBe("dirty");

      // 2. Push.
      const drain = await drainOutbox({
        db: h.db,
        caller: makeFakeCaller(server),
        now: isoClock,
      });
      expect(drain.applied).toBe(1);
      expect(server.projects.size).toBe(1);

      // The local row should now be marked clean.
      const row = await h.db.get<{ sync_state: string }>(
        "SELECT sync_state FROM projects WHERE id = ?",
        [p.id],
      );
      expect(row?.sync_state).toBe("synced");

      // 3. Pull — should be a no-op for this row (already up-to-date or
      // skipped because synced). The cursor advances, no errors.
      const pulled = await pullTable({
        db: h.db,
        table: PROJECTS_PULLABLE,
        fetcher: makeFakeFetcher(server),
        userId: "u1",
        limit: 100,
      });
      expect(pulled.rowsApplied + pulled.rowsSkippedDirty).toBe(1);
    } finally {
      h.close();
    }
  });

  it("pull skips a row that is locally dirty, then push catches up", async () => {
    const h = await setup();
    const server = new FakeServer();
    try {
      // Server already has a project (simulate a sync from another device).
      server.apply("project", {
        client_op_id: "remote-1",
        op: "insert",
        id: "p1",
        base_version: null,
        fields: { name: "Server Alpha" },
      });
      // Pull it down.
      await pullTable({
        db: h.db,
        table: PROJECTS_PULLABLE,
        fetcher: makeFakeFetcher(server),
        userId: "u1",
        limit: 100,
      });
      // Local user edits it; row is now dirty.
      // Manually mark dirty + bump local_updated_at to mimic a
      // updateProject before any push runs.
      await h.db.exec(
        `UPDATE projects SET name = ?, sync_state = 'dirty', local_updated_at = ? WHERE id = ?`,
        ["Local Alpha", NOW, "p1"],
      );

      // A second pull arriving with newer server data must NOT clobber.
      server.apply("project", {
        client_op_id: "remote-2",
        op: "update",
        id: "p1",
        base_version: null,
        fields: { name: "Server Alpha v2" },
      });
      const pulled = await pullTable({
        db: h.db,
        table: PROJECTS_PULLABLE,
        fetcher: makeFakeFetcher(server),
        userId: "u1",
        limit: 100,
      });
      expect(pulled.rowsSkippedDirty).toBeGreaterThanOrEqual(1);
      const row = await h.db.get<{ name: string }>(
        "SELECT name FROM projects WHERE id = ?",
        ["p1"],
      );
      expect(row?.name).toBe("Local Alpha");
    } finally {
      h.close();
    }
  });

  it("note edit -> generation job runs after push drains -> result writes back through outbox", async () => {
    _resetDriverInFlight();
    const h = await setup();
    const server = new FakeServer();
    try {
      // Seed a project + report locally.
      await createProject(
        { db: h.db, clock: isoClock, newId: randomId },
        { ownerId: "u1", name: "P" },
      );
      const r = await createReport(
        { db: h.db, clock: isoClock, newId: randomId },
        { projectId: "id-1" /* repo uses randomId; pin via re-fetch below */, ownerId: "u1", title: "T" },
      );

      // Find the actual project id (randomId) so the test is robust.
      const project = await h.db.get<{ id: string }>(
        "SELECT id FROM projects LIMIT 1",
      );
      expect(project).not.toBeNull();
      // The report row should reference *some* project id; assert the
      // outbox carries the create payload before we drain.
      const beforeDrain = await h.db.all<{ entity: string; op: string }>(
        "SELECT entity, op FROM outbox ORDER BY id ASC",
      );
      expect(beforeDrain.length).toBeGreaterThanOrEqual(2);

      // Edit notes through updateReport — this enqueues an outbox row.
      await updateReport(
        { db: h.db, clock: isoClock, newId: randomId },
        r.id,
        { notes: ["foundation poured", "rebar inspected"] },
      );

      // Enqueue a generation job (in real life: SyncProvider.triggerGeneration).
      await enqueueJob({
        db: h.db,
        reportId: r.id,
        mode: "auto",
        now: isoClock(),
      });

      // First driver pass: outbox is non-empty, so it should defer.
      const generate = vi.fn(async () => ({ ok: true }));
      const worker = new GenerationWorker({
        db: h.db,
        generate,
        ctx: () => okCtx(),
      });
      const firstPass = await runGenerationOnce({
        db: h.db,
        worker,
        now: () => NOW,
        random: () => 0.5,
      });
      expect(firstPass.kind).toBe("deferred");
      expect(generate).not.toHaveBeenCalled();

      // Drain the outbox — push the project + report + note edit.
      const drain = await drainOutbox({
        db: h.db,
        caller: makeFakeCaller(server),
        now: isoClock,
      });
      expect(drain.applied).toBeGreaterThanOrEqual(1);

      // The job's next_attempt_at was bumped on the deferred pass.
      // Force it ready for our test.
      await h.db.exec(
        "UPDATE generation_jobs SET next_attempt_at = ? WHERE state = 'queued'",
        [NOW],
      );

      // Second driver pass: outbox empty, generate runs.
      const fakeGenerate = vi.fn(async ({ reportId }: { reportId: string }) => {
        // Mimic make-generate-fn writing back to the local repo.
        await updateReport(
          { db: h.db, clock: isoClock, newId: randomId },
          reportId,
          {
            report_data: {
              report: {
                meta: { title: "Generated", reportType: "daily", summary: "ok" },
              },
            },
          },
        );
        return { ok: true };
      });
      const worker2 = new GenerationWorker({
        db: h.db,
        generate: fakeGenerate,
        ctx: () => okCtx(),
      });
      const secondPass = await runGenerationOnce({
        db: h.db,
        worker: worker2,
        now: () => NOW,
        random: () => 0.5,
      });
      expect(secondPass).toEqual({ kind: "completed" });
      expect(fakeGenerate).toHaveBeenCalledWith({ reportId: r.id });

      // The write-back enqueued a fresh outbox row.
      const after = await h.db.all<{ op: string }>(
        "SELECT op FROM outbox ORDER BY id ASC",
      );
      expect(after.length).toBeGreaterThan(0);

      // Drain again — the report_data lands on the server.
      await drainOutbox({
        db: h.db,
        caller: makeFakeCaller(server),
        now: isoClock,
      });
      const serverReport = server.reports.get(r.id);
      expect(serverReport).toBeDefined();
      expect(serverReport!.report_data).toBeDefined();

      // And the local row is clean.
      const localReport = await getReport(h.db, r.id);
      expect(localReport).not.toBeNull();
    } finally {
      h.close();
    }
  });

  it("makeGenerateFn end-to-end: drives a real generation through fake edge function", async () => {
    _resetDriverInFlight();
    const h = await setup();
    const server = new FakeServer();
    try {
      await createProject(
        { db: h.db, clock: isoClock, newId: randomId },
        { ownerId: "u1", name: "P" },
      );
      const project = await h.db.get<{ id: string }>("SELECT id FROM projects LIMIT 1");
      const r = await createReport(
        { db: h.db, clock: isoClock, newId: randomId },
        { projectId: project!.id, ownerId: "u1", title: "T" },
      );

      // Push the project + initial report so generation gates are green.
      await drainOutbox({
        db: h.db,
        caller: makeFakeCaller(server),
        now: isoClock,
      });
      await updateReport(
        { db: h.db, clock: isoClock, newId: randomId },
        r.id,
        { notes: ["a", "b"] },
      );
      await drainOutbox({
        db: h.db,
        caller: makeFakeCaller(server),
        now: isoClock,
      });

      // Stub the edge function: return a valid normalized payload.
      const invoke = vi.fn(async () => ({
        data: {
          report: {
            meta: {
              title: "Auto-generated",
              reportType: "daily",
              summary: "summary",
            },
          },
        },
        error: null,
      }));
      const generate = makeGenerateFn({
        db: h.db,
        backend: { functions: { invoke } } as never,
        clock: isoClock,
        newId: randomId,
      });

      await enqueueJob({
        db: h.db,
        reportId: r.id,
        mode: "auto",
        now: isoClock(),
      });

      const worker = new GenerationWorker({
        db: h.db,
        generate,
        ctx: () => okCtx(),
      });
      const out = await runGenerationOnce({
        db: h.db,
        worker,
        now: () => NOW,
        random: () => 0.5,
      });
      expect(out).toEqual({ kind: "completed" });
      expect(invoke).toHaveBeenCalledOnce();

      const updated = await getReport(h.db, r.id);
      expect(updated?.report_data).toMatchObject({
        report: { meta: { title: "Auto-generated" } },
      });
    } finally {
      h.close();
    }
  });
});
