/**
 * Integration tests — POST /v1/sync/:entity against a real Postgres.
 *
 * Verifies the `withAuthClaims` GUC trick + existing
 * `apply_<entity>_mutation` SECURITY DEFINER RPCs route through RLS
 * exactly as PostgREST callers would. The mocked unit tests in
 * `src/services/sync-apply.test.ts` cannot catch policy regressions —
 * those need a real DB.
 *
 * Skipped automatically when no DB is available. To run locally:
 *
 *   supabase start
 *   eval "$(supabase status -o env)"  # exports DB_URL
 *   INTEGRATION_DATABASE_URL="$DB_URL" \
 *   TEST_JWT_SECRET=test-secret \
 *   pnpm --filter @harpa/api test:integration
 *
 * Uses the seeded users from `supabase/seed.sql`:
 *   - Mike  11111111-1111-1111-1111-111111111111
 *   - Sarah 22222222-2222-2222-2222-222222222222
 */
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createApp } from "@/app";
import { authHeaders } from "../helpers/auth";

const DATABASE_URL =
  process.env.INTEGRATION_DATABASE_URL ?? process.env.DB_URL ?? "";

// Skip the entire suite if no real DB is configured. CI for this lane
// sets INTEGRATION_DATABASE_URL; unit-test CI does not.
const describeIntegration = DATABASE_URL ? describe : describe.skip;

const MIKE = "11111111-1111-1111-1111-111111111111";
const SARAH = "22222222-2222-2222-2222-222222222222";

let sql: postgres.Sql;
const createdProjectIds: string[] = [];

beforeAll(() => {
  process.env.NODE_ENV = "test";
  process.env.TEST_JWT_SECRET ??= "integration-test-secret";
  if (DATABASE_URL) {
    sql = postgres(DATABASE_URL, { max: 4, prepare: false });
  }
});

afterAll(async () => {
  if (!sql) return;
  if (createdProjectIds.length > 0) {
    await sql`DELETE FROM public.projects WHERE id = ANY(${createdProjectIds})`;
  }
  await sql.end({ timeout: 5 });
});

describeIntegration("POST /v1/sync/project (real DB)", () => {
  const newId = (): string =>
    `99999999-${Date.now().toString(16).padStart(8, "0").slice(-8)}-4000-8000-${Math.random()
      .toString(16)
      .slice(2, 14)
      .padEnd(12, "0")}`;

  it("inserts a project for the authenticated user via the apply RPC", async () => {
    const app = createApp({ getSql: () => sql });
    const projectId = newId();
    createdProjectIds.push(projectId);

    const headers = await authHeaders(MIKE);
    const res = await app.request("/v1/sync/project", {
      method: "POST",
      body: JSON.stringify({
        client_op_id: newId(),
        op: "insert",
        id: projectId,
        base_version: null,
        fields: {
          name: "Integration test site",
          owner_id: MIKE,
        },
      }),
      headers: { ...headers, "Content-Type": "application/json" },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; row: { owner_id: string } | null };
    expect(["applied", "duplicate"]).toContain(body.status);

    // Direct DB read confirms the row landed and is owned by Mike.
    const rows = await sql<{ owner_id: string }[]>`
      SELECT owner_id FROM public.projects WHERE id = ${projectId}
    `;
    expect(rows[0]?.owner_id).toBe(MIKE);
  });

  it("rejects a stranger trying to update Mike's project (RLS)", async () => {
    const app = createApp({ getSql: () => sql });
    const targetProjectId = createdProjectIds.at(-1)!;

    const headers = await authHeaders(SARAH);
    const res = await app.request("/v1/sync/project", {
      method: "POST",
      body: JSON.stringify({
        client_op_id: newId(),
        op: "update",
        id: targetProjectId,
        base_version: null,
        fields: { name: "PWNED by Sarah" },
      }),
      headers: { ...headers, "Content-Type": "application/json" },
    });

    // The apply RPC returns status="forbidden" rather than throwing —
    // the mutation never happens.
    expect([200, 401, 403]).toContain(res.status);
    if (res.status === 200) {
      const body = (await res.json()) as { status: string };
      expect(body.status).toBe("forbidden");
    }

    const rows = await sql<{ name: string }[]>`
      SELECT name FROM public.projects WHERE id = ${targetProjectId}
    `;
    expect(rows[0]?.name).not.toBe("PWNED by Sarah");
  });
});

describeIntegration("GET /v1/sync/projects (real DB)", () => {
  it("returns only the caller's projects", async () => {
    const app = createApp({ getSql: () => sql });
    const headers = await authHeaders(SARAH);

    const res = await app.request("/v1/sync/projects?limit=100", { headers });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      rows: Array<{ owner_id: string }>;
      nextCursor: string | null;
    };
    for (const row of body.rows) {
      expect(row.owner_id).toBe(SARAH);
    }
  });
});
