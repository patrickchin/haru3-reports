/**
 * Integration-style tests for the GET /v1/sync/:table route.
 * Uses a fake Sql injected into createApp.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { resetEnvForTesting } from "../env.js";
import { resetLoggerForTesting } from "../logger.js";
import { authHeaders } from "../../tests/helpers/auth.js";
import type { Sql } from "../services/sync-pull.js";

const USER = "00000000-0000-0000-0000-0000000000aa";

interface CapturedCall {
  text: string;
  values: unknown[];
}

function makeFakeSql(rows: unknown[]): { sql: Sql; calls: CapturedCall[] } {
  const calls: CapturedCall[] = [];
  const sql = ((strings: TemplateStringsArray, ...values: unknown[]) => {
    calls.push({ text: strings.join("?"), values });
    return Promise.resolve(rows);
  }) as unknown as Sql;
  return { sql, calls };
}

beforeEach(() => {
  resetEnvForTesting();
  resetLoggerForTesting();
  process.env.NODE_ENV = "test";
  process.env.TEST_JWT_SECRET = "sync-route-secret";
});

describe("GET /v1/sync/:table", () => {
  it("requires authentication", async () => {
    const { sql } = makeFakeSql([]);
    const app = createApp({ getSql: () => sql });
    const res = await app.request("/v1/sync/projects");
    expect(res.status).toBe(401);
  });

  it("returns 404 for unknown tables", async () => {
    const { sql } = makeFakeSql([]);
    const app = createApp({ getSql: () => sql });
    const headers = await authHeaders(USER);
    const res = await app.request("/v1/sync/users", { headers });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { message: string };
    expect(body.message).toMatch(/Unknown sync table: users/);
  });

  it("returns 422 for malformed cursor", async () => {
    const { sql } = makeFakeSql([]);
    const app = createApp({ getSql: () => sql });
    const headers = await authHeaders(USER);
    const res = await app.request("/v1/sync/projects?cursor=not-a-date", {
      headers,
    });
    expect(res.status).toBe(422);
  });

  it("returns 422 for limit > 1000", async () => {
    const { sql } = makeFakeSql([]);
    const app = createApp({ getSql: () => sql });
    const headers = await authHeaders(USER);
    const res = await app.request("/v1/sync/projects?limit=2000", { headers });
    expect(res.status).toBe(422);
  });

  it("returns rows with nextCursor=null when fewer than limit", async () => {
    const updatedAt = new Date("2024-06-01T00:00:00Z");
    const { sql, calls } = makeFakeSql([
      { id: "p1", updated_at: updatedAt, name: "Alpha" },
    ]);
    const app = createApp({ getSql: () => sql });
    const headers = await authHeaders(USER);
    const res = await app.request("/v1/sync/projects?limit=500", { headers });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      rows: { id: string }[];
      nextCursor: string | null;
    };
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0]!.id).toBe("p1");
    expect(body.nextCursor).toBeNull();
    // Authz: userId from JWT was bound into the query.
    expect(calls[0]!.values).toContain(USER);
  });

  it("returns nextCursor = last row updated_at when page is full", async () => {
    const t1 = new Date("2024-06-01T00:00:00Z");
    const t2 = new Date("2024-06-02T00:00:00Z");
    const { sql } = makeFakeSql([
      { id: "p1", updated_at: t1 },
      { id: "p2", updated_at: t2 },
    ]);
    const app = createApp({ getSql: () => sql });
    const headers = await authHeaders(USER);
    const res = await app.request("/v1/sync/projects?limit=2", { headers });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { nextCursor: string | null };
    expect(body.nextCursor).toBe(t2.toISOString());
  });

  it("threads cursor query param into the SQL call", async () => {
    const { sql, calls } = makeFakeSql([]);
    const app = createApp({ getSql: () => sql });
    const headers = await authHeaders(USER);
    const cursor = "2024-01-15T10:00:00.000Z";
    const res = await app.request(
      `/v1/sync/reports?cursor=${encodeURIComponent(cursor)}`,
      { headers },
    );
    expect(res.status).toBe(200);
    const cursorBound = calls[0]!.values.find(
      (v): v is Date => v instanceof Date,
    );
    expect(cursorBound?.toISOString()).toBe(cursor);
  });

  it("works for every pullable table", async () => {
    const tables = ["projects", "reports", "project_members", "file_metadata", "report_notes"];
    const headers = await authHeaders(USER);
    for (const t of tables) {
      const { sql } = makeFakeSql([]);
      const app = createApp({ getSql: () => sql });
      const res = await app.request(`/v1/sync/${t}`, { headers });
      expect(res.status, `table=${t}`).toBe(200);
    }
  });
});
