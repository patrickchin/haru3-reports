import { describe, it, expect, vi } from "vitest";

import { openInMemoryDb } from "../local-db/better-sqlite-adapter";
import { runMigrations } from "../local-db/run-migrations";
import {
  GenerationWorker,
  type WorkerDeps,
} from "./generation-worker";
import type { GenerationContext } from "./generation-policy";

const NOW = "2026-04-27T00:00:00Z";

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
  const handle = openInMemoryDb();
  await runMigrations(handle.db);
  // Seed a project + report.
  await handle.db.exec(
    `INSERT INTO projects (id, owner_id, name, status, created_at, updated_at, local_updated_at, sync_state)
     VALUES (?,?,?,?,?,?,?,?)`,
    ["p1", "u1", "P", "active", NOW, NOW, NOW, "synced"],
  );
  await handle.db.exec(
    `INSERT INTO reports (id, project_id, owner_id, title, report_type, status, created_at, updated_at, local_updated_at, sync_state)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    ["r1", "p1", "u1", "T", "daily", "draft", NOW, NOW, NOW, "synced"],
  );
  return handle;
}

describe("GenerationWorker.runIfReady", () => {
  it("calls generate when all gates are green", async () => {
    const h = await setup();
    try {
      const generate = vi.fn(async () => ({ ok: true }));
      const worker = new GenerationWorker({
        db: h.db,
        generate,
        ctx: () => okCtx(),
      } satisfies WorkerDeps);
      const result = await worker.runIfReady("r1");
      expect(result).toEqual({ kind: "ran", ok: true });
      expect(generate).toHaveBeenCalledWith({ reportId: "r1" });
    } finally {
      h.close();
    }
  });

  it("skips when policy says skip-needs-user", async () => {
    const h = await setup();
    try {
      const generate = vi.fn();
      const worker = new GenerationWorker({
        db: h.db,
        generate,
        ctx: () => okCtx({ mode: "manual", userInitiated: false }),
      });
      const r = await worker.runIfReady("r1");
      expect(r).toEqual({ kind: "skipped", reason: "policy-needs-user" });
      expect(generate).not.toHaveBeenCalled();
    } finally {
      h.close();
    }
  });

  it("defers when policy says wait", async () => {
    const h = await setup();
    try {
      const worker = new GenerationWorker({
        db: h.db,
        generate: vi.fn(),
        ctx: () => okCtx({ net: { reachable: false, type: "none" } }),
      });
      const r = await worker.runIfReady("r1");
      expect(r).toEqual({ kind: "deferred", reason: "policy-wait" });
    } finally {
      h.close();
    }
  });

  it("defers when outbox has rows for this report", async () => {
    const h = await setup();
    try {
      await h.db.exec(
        `INSERT INTO outbox (entity, entity_id, op, payload_json, base_version, created_at, attempts, next_attempt_at, client_op_id)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        ["report", "r1", "update", "{}", NOW, NOW, 0, NOW, "co-1"],
      );
      const worker = new GenerationWorker({
        db: h.db,
        generate: vi.fn(),
        ctx: () => okCtx(),
      });
      const r = await worker.runIfReady("r1");
      expect(r).toEqual({ kind: "deferred", reason: "outbox-pending" });
    } finally {
      h.close();
    }
  });

  it("defers when a voice note is still uploading or transcribing", async () => {
    const h = await setup();
    try {
      await h.db.exec(
        `INSERT INTO file_metadata (
          id, project_id, uploaded_by, bucket, storage_path, category,
          filename, mime_type, size_bytes, transcription_state, upload_state,
          report_id, created_at, updated_at, local_updated_at, sync_state
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          "vn1", "p1", "u1", "b", null, "voice-note",
          "v.m4a", "audio/m4a", 1, "running", "done",
          "r1", NOW, NOW, NOW, "dirty",
        ],
      );
      const worker = new GenerationWorker({
        db: h.db,
        generate: vi.fn(),
        ctx: () => okCtx(),
      });
      const r = await worker.runIfReady("r1");
      expect(r).toEqual({ kind: "deferred", reason: "voice-notes-pending" });
    } finally {
      h.close();
    }
  });

  it("skips when report does not exist", async () => {
    const h = await setup();
    try {
      const worker = new GenerationWorker({
        db: h.db,
        generate: vi.fn(),
        ctx: () => okCtx(),
      });
      const r = await worker.runIfReady("missing");
      expect(r).toEqual({ kind: "skipped", reason: "no-such-report" });
    } finally {
      h.close();
    }
  });

  it("single-flight: rejects concurrent runs for the same report", async () => {
    const h = await setup();
    try {
      let release!: () => void;
      let started!: () => void;
      const blocker = new Promise<{ ok: boolean }>((resolve) => {
        release = () => resolve({ ok: true });
      });
      const startedPromise = new Promise<void>((resolve) => {
        started = resolve;
      });
      const generate = vi.fn(async () => {
        started();
        return blocker;
      });
      const worker = new GenerationWorker({
        db: h.db,
        generate,
        ctx: () => okCtx(),
      });
      const first = worker.runIfReady("r1");
      // Wait until the worker actually begins the generate call.
      await startedPromise;
      const second = await worker.runIfReady("r1");
      expect(second).toEqual({ kind: "skipped", reason: "already-running" });
      release();
      expect(await first).toEqual({ kind: "ran", ok: true });
      expect(generate).toHaveBeenCalledOnce();
    } finally {
      h.close();
    }
  });

  it("releases the in-flight slot after the generate call rejects", async () => {
    const h = await setup();
    try {
      const generate = vi
        .fn()
        .mockRejectedValueOnce(new Error("boom"))
        .mockResolvedValueOnce({ ok: true });
      const worker = new GenerationWorker({
        db: h.db,
        generate,
        ctx: () => okCtx(),
      });
      await expect(worker.runIfReady("r1")).rejects.toThrow("boom");
      const second = await worker.runIfReady("r1");
      expect(second).toEqual({ kind: "ran", ok: true });
    } finally {
      h.close();
    }
  });
});
