/**
 * REST-backed generation `GenerateFn`.
 *
 * Same contract as `make-generate-fn.ts` (the Supabase edge-function
 * path). Used by `bridge-factory.ts` when
 * `EXPO_PUBLIC_USE_REST_API=1`.
 *
 * Endpoint: `POST /v1/reports/generate` (see
 * `packages/api/src/routes/reports/generate.ts`). Note: the REST API
 * does not yet accept `existingReport` / `lastProcessedNoteId` (those
 * are deferred — the API ports the basic flow only). We forward what
 * the API expects today and ignore the rest; behaviour will widen as
 * the REST service catches up.
 */
import {
  getReport,
  updateReport,
  type UpdateReportFields,
} from "../local-db/repositories/reports-repo";
import { listNotes } from "../local-db/repositories/report-notes-repo";
import type { SqlExecutor } from "../local-db/sql-executor";
import type { Clock, IdGen } from "../local-db/clock";
import { normalizeGeneratedReportPayload } from "../generated-report";
import type { GenerateFn } from "./generation-worker";
import { apiPostJson, type RequestOptions } from "../api-client";

export interface MakeGenerateFnRestDeps {
  readonly db: SqlExecutor;
  readonly clock: Clock;
  readonly newId: IdGen;
  readonly getProvider?: () => Promise<string | null>;
  readonly getModel?: () => Promise<string | null>;
  /** Inject for tests. */
  readonly request?: RequestOptions;
}

interface GenerateResponse {
  readonly report: unknown;
}

export function makeGenerateFnRest(deps: MakeGenerateFnRestDeps): GenerateFn {
  return async ({ reportId }) => {
    const report = await getReport(deps.db, reportId);
    if (!report) return { ok: false };

    const noteRows = await listNotes(deps.db, { reportId });
    const notes = noteRows
      .map((n) => n.body)
      .filter((b): b is string => typeof b === "string" && b.length > 0);
    if (notes.length === 0) {
      // The REST API rejects empty `notes`; treat as no-op rather than
      // surfacing a 422.
      return { ok: false };
    }

    const provider = (await deps.getProvider?.()) ?? undefined;
    const model = (await deps.getModel?.()) ?? undefined;

    const body: Record<string, unknown> = { notes };
    if (provider) body["provider"] = provider;
    if (model) body["model"] = model;
    if (report.project_id) body["projectId"] = report.project_id;

    const data = await apiPostJson<GenerateResponse>(
      "/v1/reports/generate",
      body,
      deps.request ?? {},
    );

    const normalized = normalizeGeneratedReportPayload(data);
    if (!normalized) {
      throw new Error(
        "POST /v1/reports/generate returned a payload that does not match the report schema",
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
