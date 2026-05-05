/**
 * Contract tests — pin the on-the-wire shape between the REST API and
 * the mobile client (`apps/mobile/lib/sync/rest-bridge.ts`).
 *
 * These tests run with NO database and NO network. They:
 *   1. Build canonical request/response payloads matching what the
 *      mobile bridge constructs and the API's Zod schemas validate.
 *   2. Boot the full Hono app with a stub `getSql` that records calls
 *      and returns canned mutation responses.
 *   3. Assert the API accepts the mobile payload (status 200) and that
 *      the response body has the exact shape the mobile push engine
 *      consumes.
 *
 * Failure here = the mobile client and API have drifted. Fix the
 * payload schema in BOTH places (mobile `rest-bridge.ts` + the route's
 * Zod schema) before merging.
 */
import { describe, expect, it } from "vitest";
import postgres from "postgres";

import { createApp } from "@/app";
import { authHeaders } from "../helpers/auth";

const MIKE = "11111111-1111-1111-1111-111111111111";

/**
 * Canonical mutation payload — must match the literal JSON
 * `apps/mobile/lib/sync/rest-bridge.ts` POSTs via `apiPostJson`.
 */
const MOBILE_MUTATION_PAYLOAD = {
  client_op_id: "00000000-0000-0000-0000-000000000001",
  op: "insert" as const,
  id: "aaaaaaaa-0000-0000-0000-000000000001",
  base_version: null,
  fields: { name: "Sample" },
};

/**
 * Canned `apply_*_mutation` response — the shape the legacy RPC
 * returns and the mobile push engine deserializes via
 * `MutationCaller`'s `MutationResponse`.
 */
const RPC_RESULT = {
  status: "applied",
  server_version: "v1",
  row: { id: "aaaaaaaa-0000-0000-0000-000000000001", name: "Sample" },
};

function stubSql(): postgres.Sql {
  // Minimum surface for `applyMutation` + `withAuthClaims`:
  //   - sql.begin(fn)              wraps fn(tx)
  //   - sql`SELECT ...` (template) returns []
  //   - tx.unsafe(query, params)   returns [{ result: RPC_RESULT }]
  const tagged = ((..._args: unknown[]) => Promise.resolve([])) as unknown as postgres.Sql;
  const tx = Object.assign(tagged, {
    unsafe: () => Promise.resolve([{ result: RPC_RESULT }]),
  });
  const sql = Object.assign(tagged, {
    begin: async (fn: (tx: typeof tagged) => Promise<unknown>) => fn(tx),
    unsafe: () => Promise.resolve([{ result: RPC_RESULT }]),
  }) as unknown as postgres.Sql;
  return sql;
}

describe("POST /v1/sync/:entity contract", () => {
  it("accepts the canonical mobile mutation payload and returns the canonical response", async () => {
    process.env.TEST_JWT_SECRET ??= "contract-test-secret";
    const app = createApp({ getSql: stubSql });
    const headers = await authHeaders(MIKE);

    const res = await app.request("/v1/sync/project", {
      method: "POST",
      body: JSON.stringify(MOBILE_MUTATION_PAYLOAD),
      headers: { ...headers, "Content-Type": "application/json" },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    // Shape pinned: { status, server_version, row }
    expect(Object.keys(body).sort()).toEqual(["row", "server_version", "status"]);
    expect(body["status"]).toBe("applied");
    expect(typeof body["server_version"]).toBe("string");
  });

  it("rejects a payload with a missing required field (drift signal)", async () => {
    process.env.TEST_JWT_SECRET ??= "contract-test-secret";
    const app = createApp({ getSql: stubSql });
    const headers = await authHeaders(MIKE);

    const { client_op_id: _drop, ...withoutOpId } = MOBILE_MUTATION_PAYLOAD;
    void _drop;
    const res = await app.request("/v1/sync/project", {
      method: "POST",
      body: JSON.stringify(withoutOpId),
      headers: { ...headers, "Content-Type": "application/json" },
    });
    expect(res.status).toBe(422);
  });

  it("rejects an unknown entity (drift signal)", async () => {
    process.env.TEST_JWT_SECRET ??= "contract-test-secret";
    const app = createApp({ getSql: stubSql });
    const headers = await authHeaders(MIKE);

    const res = await app.request("/v1/sync/bogus_entity", {
      method: "POST",
      body: JSON.stringify(MOBILE_MUTATION_PAYLOAD),
      headers: { ...headers, "Content-Type": "application/json" },
    });
    expect(res.status).toBe(404);
  });
});

describe("GET /v1/sync/:table contract", () => {
  it("returns { rows, nextCursor } shape the mobile fetcher expects", async () => {
    process.env.TEST_JWT_SECRET ??= "contract-test-secret";
    // For pull, we need sql to behave like a tagged template returning rows.
    const fakeSql = ((strings: TemplateStringsArray, ..._values: unknown[]) => {
      void strings;
      return Promise.resolve([]);
    }) as unknown as postgres.Sql;

    const app = createApp({ getSql: () => fakeSql });
    const headers = await authHeaders(MIKE);

    const res = await app.request("/v1/sync/projects?limit=10", { headers });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    // Shape pinned: { rows, nextCursor }
    expect(Object.keys(body).sort()).toEqual(["nextCursor", "rows"]);
    expect(Array.isArray(body["rows"])).toBe(true);
  });
});
