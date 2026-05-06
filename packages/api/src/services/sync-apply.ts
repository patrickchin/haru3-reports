/**
 * Sync apply service.
 *
 * Wraps the existing `apply_<entity>_mutation(jsonb)` Postgres RPCs so
 * the REST API is byte-for-byte compatible with what the mobile push
 * engine expects today (see `apps/mobile/lib/sync/push-engine.ts`).
 *
 * Why call the RPC instead of re-implementing in TS?
 *
 *   - The RPCs are SECURITY DEFINER plpgsql with subtle invariants:
 *     idempotency via `client_ops`, conflict detection via `base_version`,
 *     ownership/membership checks per op. Re-implementing carries
 *     real risk; calling them preserves exact semantics.
 *   - The migration plan defers RPC retirement to P9, after we've proven
 *     parity at the API boundary and locked down PostgREST (P8).
 *
 * `auth.uid()` inside the RPCs reads from the session GUC
 * `request.jwt.claims`. We set it per-transaction with the userId
 * coming out of the API's own JWT verification, so the RPC sees the
 * same user identity it would under PostgREST.
 */

import { HTTPException } from "hono/http-exception";

import type { Sql } from "./sync-pull.js";

export const APPLIABLE_ENTITIES = [
  "project",
  "report",
  "file_metadata",
  "report_note",
] as const;

export type ApplyEntity = (typeof APPLIABLE_ENTITIES)[number];

export type MutationOp = "insert" | "update" | "delete";

export type MutationStatus =
  | "applied"
  | "duplicate"
  | "conflict"
  | "forbidden";

export interface MutationPayload {
  readonly client_op_id: string;
  readonly op: MutationOp;
  readonly id: string;
  readonly base_version: string | null;
  readonly fields: Record<string, unknown>;
}

export interface MutationResponse {
  readonly status: MutationStatus;
  readonly server_version: string;
  readonly row: Record<string, unknown> | null;
}

export function isApplyEntity(value: string): value is ApplyEntity {
  return (APPLIABLE_ENTITIES as readonly string[]).includes(value);
}

const RPC_BY_ENTITY: Record<ApplyEntity, string> = {
  project: "apply_project_mutation",
  report: "apply_report_mutation",
  file_metadata: "apply_file_metadata_mutation",
  report_note: "apply_report_note_mutation",
};

/** Allowlist used to build the safe-to-inline RPC call. */
const RPC_NAMES = new Set(Object.values(RPC_BY_ENTITY));

/**
 * Runs `fn` inside a transaction with `request.jwt.claims` set so that
 * `auth.uid()` inside Postgres functions returns `userId`.
 *
 * Uses `set_local` (transaction-scoped) so concurrent requests on the
 * same pool don't see each other's claims.
 */
export async function withAuthClaims<T>(
  sql: Sql,
  userId: string,
  fn: (tx: Sql) => Promise<T>,
): Promise<T> {
  const claims = JSON.stringify({ sub: userId, role: "authenticated" });
  return sql.begin(async (tx) => {
    await tx`SELECT set_config('request.jwt.claims', ${claims}, true)`;
    await tx`SELECT set_config('request.jwt.claim.sub', ${userId}, true)`;
    await tx`SELECT set_config('role', 'authenticated', true)`;
    return fn(tx as unknown as Sql);
  }) as Promise<T>;
}

export interface ApplyArgs {
  readonly sql: Sql;
  readonly userId: string;
  readonly entity: ApplyEntity;
  readonly payload: MutationPayload;
}

/**
 * Calls `apply_<entity>_mutation($1::jsonb)` inside an authenticated
 * transaction and returns the parsed response.
 *
 * Throws `HTTPException(401)` if the RPC raises `42501` (auth required —
 * shouldn't happen because we just verified the JWT, but defence in depth).
 * Other Postgres errors propagate.
 */
export async function applyMutation({
  sql,
  userId,
  entity,
  payload,
}: ApplyArgs): Promise<MutationResponse> {
  const rpc = RPC_BY_ENTITY[entity];
  if (!RPC_NAMES.has(rpc)) {
    // Unreachable given the type narrowing, but guards against future
    // refactors that bypass `isApplyEntity`.
    throw new HTTPException(404, { message: `Unknown entity: ${entity}` });
  }

  try {
    return await withAuthClaims(sql, userId, async (tx) => {
      // The RPC name is a value from the allowlist above, never user
      // input — safe to interpolate via sql.unsafe.
      //
      // Pass the payload as a JS object: postgres.js encodes it as a
      // jsonb object. Passing JSON.stringify(payload) here would bind a
      // text scalar, and `$1::jsonb` would parse that as a JSON string
      // — `->>'op'` would return NULL, surfacing as `unknown op <NULL>`
      // from the RPC. (Regression smoke-tested against /v1/sync/project.)
      const rows = (await tx.unsafe(`SELECT ${rpc}($1::jsonb) AS result`, [
        payload as unknown as never,
      ])) as { result: MutationResponse }[];

      const result = rows[0]?.result;
      if (!result || typeof result !== "object") {
        throw new HTTPException(502, {
          message: "RPC returned no result",
        });
      }
      return result;
    });
  } catch (err) {
    if (err instanceof HTTPException) throw err;
    if (isPgError(err) && err.code === "42501") {
      throw new HTTPException(401, { message: "Not authorised" });
    }
    if (isPgError(err) && err.code === "22023") {
      // unknown op — caller sent a bad payload
      throw new HTTPException(422, {
        message: err.message ?? "Invalid mutation payload",
      });
    }
    throw err;
  }
}

interface PgErrorLike {
  readonly code?: string;
  readonly message?: string;
}

function isPgError(err: unknown): err is PgErrorLike {
  return typeof err === "object" && err !== null && "code" in err;
}

// Re-export Sql for route module convenience.
export type { Sql };
