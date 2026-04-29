/**
 * Edge-function caller for the generation worker.
 *
 * Builds a `GenerateFn` that:
 *   1. Loads the report from the local DB.
 *   2. Calls the `generate-report` edge function with notes + existing
 *      `report_data` (the same payload `useReportGeneration` sends).
 *   3. Writes the returned `report_data` back through the local repo —
 *      which enqueues an outbox row so the change syncs to the server.
 *
 * The generation worker treats this function as opaque: it just needs
 * a `(reportId) => Promise<{ ok }>`. Errors propagate so the driver
 * can apply retry/backoff.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  getReport,
  updateReport,
  type UpdateReportFields,
} from "../local-db/repositories/reports-repo";
import type { SqlExecutor } from "../local-db/sql-executor";
import type { Clock, IdGen } from "../local-db/clock";
import { normalizeGeneratedReportPayload } from "../generated-report";
import type { GenerateFn } from "./generation-worker";

export type MakeGenerateFnDeps = {
  db: SqlExecutor;
  backend: Pick<SupabaseClient, "functions">;
  clock: Clock;
  newId: IdGen;
  /** Optional provider/model overrides; defaults handled by the edge fn. */
  getProvider?: () => Promise<string | null>;
  getModel?: () => Promise<string | null>;
};

export function makeGenerateFn(deps: MakeGenerateFnDeps): GenerateFn {
  return async ({ reportId }) => {
    const report = await getReport(deps.db, reportId);
    if (!report) {
      // Treat a vanished report as ok=false so the driver records and
      // moves on rather than thrashing.
      return { ok: false };
    }

    const notes = (report.notes as unknown[]).filter(
      (n): n is string => typeof n === "string",
    );
    const existingReport =
      Object.keys(report.report_data).length > 0
        ? report.report_data
        : null;

    const provider = (await deps.getProvider?.()) ?? undefined;
    const model = (await deps.getModel?.()) ?? undefined;

    const body: Record<string, unknown> = {
      notes,
      projectId: report.project_id,
    };
    if (provider) body.provider = provider;
    if (model) body.model = model;
    if (existingReport) body.existingReport = existingReport;

    const { data, error } = await deps.backend.functions.invoke(
      "generate-report",
      { body },
    );
    if (error) {
      const status = (error as { status?: number }).status;
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        status
          ? `generate-report HTTP ${status}: ${message}`
          : `generate-report: ${message}`,
      );
    }

    const normalized = normalizeGeneratedReportPayload(data);
    if (!normalized) {
      throw new Error(
        "generate-report returned a payload that does not match the report schema",
      );
    }

    const fields: UpdateReportFields = {
      report_data: normalized as unknown as Record<string, unknown>,
    };
    await updateReport(
      { db: deps.db, clock: deps.clock, newId: deps.newId },
      reportId,
      fields,
    );

    return { ok: true };
  };
}
