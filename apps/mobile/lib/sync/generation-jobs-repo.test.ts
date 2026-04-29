import { describe, it, expect } from "vitest";

import { openInMemoryDb } from "../local-db/better-sqlite-adapter";
import { runMigrations } from "../local-db/run-migrations";
import {
  enqueueJob,
  claimNextReady,
  resetStaleRunning,
  markCompleted,
  markFailed,
  rescheduleAfterTransient,
} from "./generation-jobs-repo";

const NOW = "2026-04-30T00:00:00Z";
const LATER = "2026-04-30T00:01:00Z";

async function setup() {
  const h = openInMemoryDb();
  await runMigrations(h.db);
  return h;
}

describe("generation-jobs-repo.enqueueJob", () => {
  it("inserts a queued row when none exists", async () => {
    const h = await setup();
    try {
      const id = await enqueueJob({
        db: h.db,
        reportId: "r1",
        mode: "auto",
        lastProcessedNoteCount: 3,
        now: NOW,
      });
      expect(id).toBeGreaterThan(0);
      const row = await h.db.get(
        "SELECT * FROM generation_jobs WHERE id = ?",
        [id],
      );
      expect(row).toMatchObject({
        report_id: "r1",
        mode: "auto",
        state: "queued",
        attempts: 0,
        last_processed_note_count: 3,
        next_attempt_at: NOW,
        created_at: NOW,
      });
    } finally {
      h.close();
    }
  });

  it("coalesces a second enqueue into the existing queued row", async () => {
    const h = await setup();
    try {
      const id = await enqueueJob({
        db: h.db, reportId: "r1", mode: "auto",
        lastProcessedNoteCount: 1, now: NOW,
      });
      const id2 = await enqueueJob({
        db: h.db, reportId: "r1", mode: "auto",
        lastProcessedNoteCount: 5, now: LATER,
      });
      expect(id2).toBe(id);
      const rows = await h.db.all(
        "SELECT * FROM generation_jobs WHERE report_id = ?",
        ["r1"],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        last_processed_note_count: 5,
        next_attempt_at: LATER,
      });
    } finally {
      h.close();
    }
  });

  it("does not coalesce into a completed/failed row", async () => {
    const h = await setup();
    try {
      const id1 = await enqueueJob({
        db: h.db, reportId: "r1", mode: "auto", now: NOW,
      });
      await markCompleted(h.db, id1, NOW);
      const id2 = await enqueueJob({
        db: h.db, reportId: "r1", mode: "auto", now: LATER,
      });
      expect(id2).not.toBe(id1);
      const rows = await h.db.all(
        "SELECT id, state FROM generation_jobs WHERE report_id = ? ORDER BY id",
        ["r1"],
      );
      expect(rows).toEqual([
        { id: id1, state: "completed" },
        { id: id2, state: "queued" },
      ]);
    } finally {
      h.close();
    }
  });
});

describe("generation-jobs-repo.claimNextReady", () => {
  it("returns null when nothing is due", async () => {
    const h = await setup();
    try {
      const got = await claimNextReady(h.db, NOW);
      expect(got).toBeNull();
    } finally {
      h.close();
    }
  });

  it("ignores rows whose next_attempt_at is in the future", async () => {
    const h = await setup();
    try {
      await enqueueJob({ db: h.db, reportId: "r1", mode: "auto", now: LATER });
      const got = await claimNextReady(h.db, NOW); // before LATER
      expect(got).toBeNull();
    } finally {
      h.close();
    }
  });

  it("flips state to running for the picked row", async () => {
    const h = await setup();
    try {
      const id = await enqueueJob({
        db: h.db, reportId: "r1", mode: "auto", now: NOW,
      });
      const got = await claimNextReady(h.db, LATER);
      expect(got).not.toBeNull();
      expect(got?.id).toBe(id);
      expect(got?.state).toBe("running");
      const row = await h.db.get(
        "SELECT state FROM generation_jobs WHERE id = ?",
        [id],
      );
      expect(row?.state).toBe("running");
    } finally {
      h.close();
    }
  });

  it("does not pick rows already in running state", async () => {
    const h = await setup();
    try {
      await enqueueJob({ db: h.db, reportId: "r1", mode: "auto", now: NOW });
      const first = await claimNextReady(h.db, LATER);
      expect(first).not.toBeNull();
      const second = await claimNextReady(h.db, LATER);
      expect(second).toBeNull();
    } finally {
      h.close();
    }
  });
});

describe("generation-jobs-repo.resetStaleRunning", () => {
  it("re-queues rows stranded in running state and reports the count", async () => {
    const h = await setup();
    try {
      await enqueueJob({ db: h.db, reportId: "r1", mode: "auto", now: NOW });
      await enqueueJob({ db: h.db, reportId: "r2", mode: "auto", now: NOW });
      await claimNextReady(h.db, LATER);
      await claimNextReady(h.db, LATER);
      const n = await resetStaleRunning(h.db);
      expect(n).toBe(2);
      const states = (
        await h.db.all<{ state: string }>("SELECT state FROM generation_jobs")
      ).map((r) => r.state);
      expect(states.sort()).toEqual(["queued", "queued"]);
    } finally {
      h.close();
    }
  });
});

describe("generation-jobs-repo.markCompleted / markFailed / reschedule", () => {
  it("marks completed with timestamp and clears error", async () => {
    const h = await setup();
    try {
      const id = await enqueueJob({
        db: h.db, reportId: "r1", mode: "auto", now: NOW,
      });
      await markFailed(h.db, id, "first try");
      // Pretend a retry succeeded.
      await markCompleted(h.db, id, LATER);
      const row = await h.db.get(
        "SELECT state, completed_at, error FROM generation_jobs WHERE id = ?",
        [id],
      );
      expect(row).toEqual({ state: "completed", completed_at: LATER, error: null });
    } finally {
      h.close();
    }
  });

  it("rescheduleAfterTransient bumps attempts and re-queues", async () => {
    const h = await setup();
    try {
      const id = await enqueueJob({
        db: h.db, reportId: "r1", mode: "auto", now: NOW,
      });
      await claimNextReady(h.db, LATER);
      await rescheduleAfterTransient(h.db, id, LATER, "network down");
      const row = await h.db.get(
        "SELECT state, attempts, next_attempt_at, error FROM generation_jobs WHERE id = ?",
        [id],
      );
      expect(row).toEqual({
        state: "queued",
        attempts: 1,
        next_attempt_at: LATER,
        error: "network down",
      });
    } finally {
      h.close();
    }
  });

  it("markFailed records error and is terminal", async () => {
    const h = await setup();
    try {
      const id = await enqueueJob({
        db: h.db, reportId: "r1", mode: "auto", now: NOW,
      });
      await markFailed(h.db, id, "permanent");
      const row = await h.db.get(
        "SELECT state, error FROM generation_jobs WHERE id = ?",
        [id],
      );
      expect(row).toEqual({ state: "failed", error: "permanent" });
      // claimNextReady should not pick it.
      const claimed = await claimNextReady(h.db, LATER);
      expect(claimed).toBeNull();
    } finally {
      h.close();
    }
  });
});
