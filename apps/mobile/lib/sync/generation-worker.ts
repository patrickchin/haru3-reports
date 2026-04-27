/**
 * Generation worker.
 *
 * Orchestrates the gates that must all be green before we call the
 * edge function `generate-report`:
 *
 *   1. Policy: shouldRunNow(...) === 'run'
 *   2. No outbox rows pending for this report (server has the latest local edits)
 *   3. Every voice-note for this report has finished transcription
 *   4. Single-flight per report id
 *
 * The worker is purely orchestrational — actual triggers (NetInfo
 * reconnect, AppState→active, manual tap, 60s tick) live at the edge
 * (Phase 4 wiring). The pure shape lets us unit-test the gating logic
 * deterministically.
 */
import type { SqlExecutor } from "../local-db/sql-executor";

import {
  shouldRunNow,
  type GenerationContext,
  type GenerationDecision,
} from "./generation-policy";

export type GenerateFn = (input: {
  reportId: string;
}) => Promise<{ ok: boolean }>;

export type RunResult =
  | { kind: "ran"; ok: boolean }
  | { kind: "skipped"; reason: SkipReason }
  | { kind: "deferred"; reason: DeferReason };

export type SkipReason =
  | "policy-needs-user"
  | "already-running"
  | "no-such-report";

export type DeferReason =
  | "policy-wait"
  | "outbox-pending"
  | "voice-notes-pending";

export type WorkerDeps = {
  db: SqlExecutor;
  generate: GenerateFn;
  ctx: () => GenerationContext;
};

export class GenerationWorker {
  private inFlight = new Set<string>();
  constructor(private readonly deps: WorkerDeps) {}

  async runIfReady(reportId: string): Promise<RunResult> {
    if (this.inFlight.has(reportId)) {
      return { kind: "skipped", reason: "already-running" };
    }
    const exists = await this.deps.db.get<{ id: string }>(
      "SELECT id FROM reports WHERE id = ? AND deleted_at IS NULL",
      [reportId],
    );
    if (!exists) return { kind: "skipped", reason: "no-such-report" };

    const decision: GenerationDecision = shouldRunNow(this.deps.ctx());
    if (decision === "skip-needs-user") {
      return { kind: "skipped", reason: "policy-needs-user" };
    }
    if (decision === "wait") {
      return { kind: "deferred", reason: "policy-wait" };
    }

    const pending = await this.deps.db.get<{ n: number }>(
      `SELECT count(*) AS n FROM outbox
       WHERE entity = 'report' AND entity_id = ?`,
      [reportId],
    );
    if ((pending?.n ?? 0) > 0) {
      return { kind: "deferred", reason: "outbox-pending" };
    }

    const vnPending = await this.deps.db.get<{ n: number }>(
      `SELECT count(*) AS n FROM file_metadata
       WHERE report_id = ?
         AND deleted_at IS NULL
         AND category = 'voice-note'
         AND (
           upload_state IN ('pending','uploading','failed')
           OR transcription_state IN ('pending','running','failed')
         )`,
      [reportId],
    );
    if ((vnPending?.n ?? 0) > 0) {
      return { kind: "deferred", reason: "voice-notes-pending" };
    }

    this.inFlight.add(reportId);
    try {
      const out = await this.deps.generate({ reportId });
      return { kind: "ran", ok: out.ok };
    } finally {
      this.inFlight.delete(reportId);
    }
  }
}
