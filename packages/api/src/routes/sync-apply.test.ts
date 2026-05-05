/**
 * Integration tests for POST /v1/sync/:entity using a fake Sql.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { resetEnvForTesting } from "../env.js";
import { resetLoggerForTesting } from "../logger.js";
import { authHeaders } from "../../tests/helpers/auth.js";
import type { Sql } from "../services/sync-pull.js";

const USER = "00000000-0000-0000-0000-0000000000bb";

interface FakeSql {
  sql: Sql;
  unsafeCalls: { text: string; values: unknown[] }[];
}

function makeFakeSql(rpcResult: unknown): FakeSql {
  const unsafeCalls: { text: string; values: unknown[] }[] = [];

  const tx = ((_s: TemplateStringsArray, ..._v: unknown[]) =>
    Promise.resolve([])) as unknown as Sql;
  (tx as unknown as { unsafe: (text: string, values: unknown[]) => Promise<unknown> }).unsafe = (
    text: string,
    values: unknown[],
  ) => {
    unsafeCalls.push({ text, values });
    return Promise.resolve([{ result: rpcResult }]);
  };

  const sql = ((_s: TemplateStringsArray, ..._v: unknown[]) =>
    Promise.resolve([])) as unknown as Sql;
  (sql as unknown as {
    begin: <T>(fn: (tx: Sql) => Promise<T>) => Promise<T>;
  }).begin = async <T,>(fn: (tx: Sql) => Promise<T>): Promise<T> => fn(tx);

  return { sql, unsafeCalls };
}

beforeEach(() => {
  resetEnvForTesting();
  resetLoggerForTesting();
  process.env.NODE_ENV = "test";
  process.env.TEST_JWT_SECRET = "apply-route-secret";
});

const validBody = {
  client_op_id: "11111111-1111-1111-1111-111111111111",
  op: "insert" as const,
  id: "22222222-2222-2222-2222-222222222222",
  base_version: null,
  fields: { name: "Site A" },
};

describe("POST /v1/sync/:entity", () => {
  it("requires authentication", async () => {
    const { sql } = makeFakeSql(null);
    const app = createApp({ getSql: () => sql });
    const res = await app.request("/v1/sync/project", {
      method: "POST",
      body: JSON.stringify(validBody),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(401);
  });

  it("returns 404 for unknown entities", async () => {
    const { sql } = makeFakeSql(null);
    const app = createApp({ getSql: () => sql });
    const headers = await authHeaders(USER);
    const res = await app.request("/v1/sync/widget", {
      method: "POST",
      body: JSON.stringify(validBody),
      headers: { ...headers, "Content-Type": "application/json" },
    });
    expect(res.status).toBe(404);
  });

  it("returns 422 for invalid JSON", async () => {
    const { sql } = makeFakeSql(null);
    const app = createApp({ getSql: () => sql });
    const headers = await authHeaders(USER);
    const res = await app.request("/v1/sync/project", {
      method: "POST",
      body: "not-json",
      headers: { ...headers, "Content-Type": "application/json" },
    });
    expect(res.status).toBe(422);
  });

  it("returns 422 for invalid op", async () => {
    const { sql } = makeFakeSql(null);
    const app = createApp({ getSql: () => sql });
    const headers = await authHeaders(USER);
    const res = await app.request("/v1/sync/project", {
      method: "POST",
      body: JSON.stringify({ ...validBody, op: "upsert" }),
      headers: { ...headers, "Content-Type": "application/json" },
    });
    expect(res.status).toBe(422);
  });

  it("returns 422 for non-uuid id", async () => {
    const { sql } = makeFakeSql(null);
    const app = createApp({ getSql: () => sql });
    const headers = await authHeaders(USER);
    const res = await app.request("/v1/sync/project", {
      method: "POST",
      body: JSON.stringify({ ...validBody, id: "not-a-uuid" }),
      headers: { ...headers, "Content-Type": "application/json" },
    });
    expect(res.status).toBe(422);
  });

  it("returns the RPC response on success", async () => {
    const rpc = {
      status: "applied",
      server_version: "2024-06-01T00:00:00Z",
      row: { id: validBody.id, name: "Site A", owner_id: USER },
    };
    const { sql, unsafeCalls } = makeFakeSql(rpc);
    const app = createApp({ getSql: () => sql });
    const headers = await authHeaders(USER);
    const res = await app.request("/v1/sync/project", {
      method: "POST",
      body: JSON.stringify(validBody),
      headers: { ...headers, "Content-Type": "application/json" },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as typeof rpc;
    expect(body).toEqual(rpc);
    expect(unsafeCalls[0]!.text).toContain("apply_project_mutation");
  });

  it("works for every appliable entity", async () => {
    const entities = ["project", "report", "file_metadata", "report_note"];
    const headers = await authHeaders(USER);
    const rpc = {
      status: "applied",
      server_version: "2024-06-01T00:00:00Z",
      row: { id: validBody.id },
    };
    for (const entity of entities) {
      const { sql } = makeFakeSql(rpc);
      const app = createApp({ getSql: () => sql });
      const res = await app.request(`/v1/sync/${entity}`, {
        method: "POST",
        body: JSON.stringify(validBody),
        headers: { ...headers, "Content-Type": "application/json" },
      });
      expect(res.status, `entity=${entity}`).toBe(200);
    }
  });

  it("does not collide with GET /v1/sync/:table", async () => {
    // POST /v1/sync/project (entity) and GET /v1/sync/projects (table)
    // are different paths. Sanity-check that GET still works.
    const { sql } = makeFakeSql(null);
    const app = createApp({ getSql: () => sql });
    const headers = await authHeaders(USER);
    const res = await app.request("/v1/sync/projects", { headers });
    expect(res.status).toBe(200);
  });
});
