import { describe, it, expect, beforeEach, vi } from "vitest";

import { openInMemoryDb } from "../local-db/better-sqlite-adapter";
import { runMigrations } from "../local-db/run-migrations";
import { GenerationWorker } from "./generation-worker";
import type { GenerationContext } from "./generation-policy";
import {
  runGenerationOnce,
  _resetDriverInFlight,
  type GenerationDriverDeps,
} from "./generation-driver";
import { enqueueJob } from "./generation-jobs-repo";

const NOW = "2026-04-30T00:00:00Z";

const okCtx = (over: Partial<GenerationContext> = {}): GenerationContext => ({
  mode: "auto_any",
  net: { reachable: true, type: "wifi" },
  battery: { level: 0.9, charging: true },
  appState: "active",
  budget: { spentToday: 0, limit: 10 },
  userInitiated: false,
  ...over,
});

async function setup() {
  const h = openInMemoryDb();
  await runMigrations(h.db);
  await h.db.exec(
    `INSERT INTO projects (id, owner_id, name, status, created_at, updated_at, local_updated_at, sync_state)
     VALUES (?,?,?,?,?,?,?,?)`,
    ["p1", "u1", "P", "active", NOW, NOW, NOW, "synced"],
  );
  await h.db.exec(
    `INSERT INTO reports (id, project_id, owner_id, title, report_type, status, created_at, updated_at, local_updated_at, sync_state)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    ["r1", "p1", "u1", "T", "daily", "draft", NOW, NOW, NOW, "synced"],
  );
  return h;
}

beforeEach(() => {
  _resetDriverInFlight();
});

describe("runGenerationOnce", () => {
  it("returns idle when no jobs are queued", async () => {
    const h = await setup();
    try {
      const generate = vi.fn();
      const worker = new GenerationWorker({ db: h.db, generate, ctx: () => okCtx() });
      const out = await runGenerationOnce({
        db: h.db, worker, now: () => NOW, random: () => 0.5,
      } satisfies GenerationDriverDeps);
      expect(out).toEqual({ kind: "idle" });
      expect(generate).not.toHaveBeenCalled();
    } finally { h.close(); }
  });

  it("runs a queued job and marks it completed on success", async () => {
    const h = await setup();
    try {
      const id = await enqueueJob({
        db: h.db, reportId: "r1", mode: "auto", now: NOW,
      });
      const generate = vi.fn(async () => ({ ok: true }));
      const worker = new GenerationWorker({ db: h.db, generate, ctx: () => okCtx() });
      const out = await runGenerationOnce({
        db: h.db, worker, now: () => NOW, random: () => 0.5,
      });
      expect(out).toEqual({ kind: "completed" });
      expect(generate).toHaveBeenCalledWith({ reportId: "r1" });
      const row = await h.db.get(
        "SELECT state, completed_at FROM generation_jobs WHERE id = ?",
        [id],
      );
      expect(row).toMatchObject({ state: "completed", completed_at: NOW });
    } finally { h.close(); }
  });

  it("reschedules with backoff when worker defers (e.g. outbox pending)", async () => {
    const h = await setup();
    try {
      // Block the report behind an outbox row.
      await h.db.exec(
        `INSERT INTO outbox (entity, entity_id, op, payload_json, base_version, created_at, attempts, next_attempt_at, client_op_id, state)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
        ["report", "r1", "update", "{}", NOW, NOW, 0, NOW, "co-1", "queued"],
      );
      const id = await enqueueJob({
        db: h.db, reportId: "r1", mode: "auto", now: NOW,
      });
      const worker = new GenerationWorker({
        db: h.db,
        generate: vi.fn(),
        ctx: () => okCtx(),
      });
      const out = await runGenerationOnce({
        db: h.db, worker, now: () => NOW, random: () => 0.5,
      });
      expect(out.kind).toBe("deferred");
      const row = await h.db.get(
        "SELECT state, attempts, error FROM generation_jobs WHERE id = ?",
        [id],
      );
      expect(row).toMatchObject({
        state: "queued",
        attempts: 1,
        error: "deferred:outbox-pending",
      });
    } finally { h.close(); }
  });

  it("marks the job failed when the report has been deleted", async () => {
    const h = await setup();
    try {
      const id = await enqueueJob({
        db: h.db, reportId: "ghost", mode: "auto", now: NOW,
      });
      const worker = new GenerationWorker({
        db: h.db, generate: vi.fn(), ctx: () => okCtx(),
      });
      const out = await runGenerationOnce({
        db: h.db, worker, now: () => NOW, random: () => 0.5,
      });
      expect(out).toEqual({ kind: "failed", error: "skipped:no-such-report" });
      const row = await h.db.get(
        "SELECT state, error FROM generation_jobs WHERE id = ?",
        [id],
      );
      expect(row).toEqual({ state: "failed", error: "skipped:no-such-report" });
    } finally { h.close(); }
  });

  it("reschedules transient errors with bumped attempts", async () => {
    const h = await setup();
    try {
      const id = await enqueueJob({
        db: h.db, reportId: "r1", mode: "auto", now: NOW,
      });
      const worker = new GenerationWorker({
        db: h.db,
        generate: vi.fn(async () => { throw new Error("boom"); }),
        ctx: () => okCtx(),
      });
      const out = await runGenerationOnce({
        db: h.db, worker, now: () => NOW, random: () => 0.5,
      });
      expect(out.kind).toBe("rescheduled");
      const row = await h.db.get(
        "SELECT state, attempts, error FROM generation_jobs WHERE id = ?",
        [id],
      );
      expect(row).toMatchObject({
        state: "queued",
        attempts: 1,
        error: "boom",
      });
    } finally { h.close(); }
  });

  it("marks the job permanently failed after MAX_ATTEMPTS retries", async () => {
    const h = await setup();
    try {
      const id = await enqueueJob({
        db: h.db, reportId: "r1", mode: "auto", now: NOW,
      });
      // Bump attempts to one less than the cap so the next failure is permanent.
      await h.db.exec(
        "UPDATE generation_jobs SET attempts = 9 WHERE id = ?",
        [id],
      );
      const worker = new GenerationWorker({
        db: h.db,
        generate: vi.fn(async () => { throw new Error("network down"); }),
        ctx: () => okCtx(),
      });
      const out = await runGenerationOnce({
        db: h.db, worker, now: () => NOW, random: () => 0.5,
      });
      expect(out).toEqual({ kind: "failed", error: "network down" });
      const row = await h.db.get(
        "SELECT state, error FROM generation_jobs WHERE id = ?",
        [id],
      );
      expect(row).toEqual({ state: "failed", error: "network down" });
    } finally { h.close(); }
  });

  it("returns idle on a re-entrant call while a pass is in flight", async () => {
    const h = await setup();
    try {
      await enqueueJob({ db: h.db, reportId: "r1", mode: "auto", now: NOW });
      let resolveGenerate!: (v: { ok: boolean }) => void;
      let started!: () => void;
      const startedP = new Promise<void>((r) => { started = r; });
      const generate = vi.fn(
        () => {
          started();
          return new Promise<{ ok: boolean }>((res) => { resolveGenerate = res; });
        },
      );
      const worker = new GenerationWorker({ db: h.db, generate, ctx: () => okCtx() });
      const deps: GenerationDriverDeps = {
        db: h.db, worker, now: () => NOW, random: () => 0.5,
      };
      const first = runGenerationOnce(deps);
      // Wait until the worker has actually invoked generate(), i.e. the
      // driver pass is mid-flight.
      await startedP;
      const second = await runGenerationOnce(deps);
      expect(second).toEqual({ kind: "idle" });
      resolveGenerate({ ok: true });
      await first;
    } finally { h.close(); }
  });

  it("invokes the onResult hook with the row and outcome", async () => {
    const h = await setup();
    try {
      const id = await enqueueJob({
        db: h.db, reportId: "r1", mode: "auto", now: NOW,
      });
      const worker = new GenerationWorker({
        db: h.db,
        generate: vi.fn(async () => ({ ok: true })),
        ctx: () => okCtx(),
      });
      const onResult = vi.fn();
      await runGenerationOnce({
        db: h.db, worker, now: () => NOW, random: () => 0.5, onResult,
      });
      expect(onResult).toHaveBeenCalledOnce();
      const [row, outcome] = onResult.mock.calls[0];
      expect(row.id).toBe(id);
      expect(outcome).toEqual({ kind: "completed" });
    } finally { h.close(); }
  });
});
