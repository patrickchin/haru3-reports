/**
 * REST adapter for the sync engines.
 *
 * Mirrors `supabase-bridge.ts` so `pull-engine.ts` and `push-engine.ts`
 * are agnostic to the transport. Switching is done by
 * `bridge-factory.ts` based on the `EXPO_PUBLIC_USE_REST_API` flag.
 *
 * Endpoints (see `packages/api/src/routes/sync-pull.ts` /
 * `packages/api/src/routes/sync-apply.ts`):
 *
 *   GET  /v1/sync/:table?cursor=<iso>&limit=<n>
 *        → { rows: PullRow[], nextCursor: string | null }
 *
 *   POST /v1/sync/:entity
 *        body: { client_op_id, op, id, base_version, fields }
 *        → MutationResponse
 */
import { apiGet, apiPostJson, type RequestOptions } from "../api-client";
import type { Fetcher, PullRow } from "./pull-engine";
import type { MutationCaller, MutationResponse } from "./push-engine";
import type { OutboxRow } from "./outbox";

// Supported sync tables in REST shape. The server validates this list,
// but we keep a parallel record so the client also rejects unknowns
// before issuing a request.
const PULL_TABLES = new Set<string>([
  "projects",
  "reports",
  "project_members",
  "file_metadata",
  "report_notes",
]);

const APPLY_ENTITIES = new Set<OutboxRow["entity"]>([
  "project",
  "report",
  "file_metadata",
  "report_note",
]);

interface PullResponseBody {
  readonly rows: PullRow[];
  readonly nextCursor: string | null;
}

export function makeRestPullFetcher(opts: RequestOptions = {}): Fetcher {
  return async (table, cursor, limit) => {
    if (!PULL_TABLES.has(table)) {
      throw new Error(`makeRestPullFetcher: no REST route for table "${table}"`);
    }
    const query: Record<string, string | number | undefined> = { limit };
    if (cursor) query["cursor"] = cursor;
    const body = await apiGet<PullResponseBody>(`/v1/sync/${table}`, {
      ...opts,
      query,
    });
    return body.rows ?? [];
  };
}

export function makeRestMutationCaller(
  opts: RequestOptions = {},
): MutationCaller {
  return async (entity, payload) => {
    if (!APPLY_ENTITIES.has(entity)) {
      throw new Error(
        `makeRestMutationCaller: no REST route for entity "${entity}"`,
      );
    }
    const res = await apiPostJson<MutationResponse>(
      `/v1/sync/${entity}`,
      payload,
      opts,
    );
    if (!res || typeof res.status !== "string") {
      throw new Error(`POST /v1/sync/${entity}: empty response`);
    }
    return res;
  };
}
