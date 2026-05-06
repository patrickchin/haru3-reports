/**
 * Tests for POST /v1/admin/backfill-thumbnails.
 */
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { errorHandler } from "../../middleware/error-handler.js";
import { createAdminRoutes } from "./backfill-thumbnails.js";

const SERVICE_KEY = "test-service-role-key";

function buildApp(deps: Parameters<typeof createAdminRoutes>[0] = {}) {
  const app = new Hono();
  app.route("/v1/admin", createAdminRoutes(deps));
  app.onError(errorHandler);
  return app;
}

describe("POST /v1/admin/backfill-thumbnails", () => {
  it("returns 503 when SERVICE_ROLE_KEY is missing", async () => {
    const app = buildApp({ serviceRoleKey: () => undefined });
    const res = await app.request("/v1/admin/backfill-thumbnails", {
      method: "POST",
      headers: { Authorization: `Bearer ${SERVICE_KEY}` },
    });
    expect(res.status).toBe(503);
  });

  it("returns 403 without Bearer header", async () => {
    const app = buildApp({ serviceRoleKey: () => SERVICE_KEY });
    const res = await app.request("/v1/admin/backfill-thumbnails", {
      method: "POST",
    });
    expect(res.status).toBe(403);
  });

  it("returns 403 for wrong key", async () => {
    const app = buildApp({ serviceRoleKey: () => SERVICE_KEY });
    const res = await app.request("/v1/admin/backfill-thumbnails", {
      method: "POST",
      headers: { Authorization: "Bearer wrong" },
    });
    expect(res.status).toBe(403);
  });

  it("returns 501 when no backfill implementation is wired", async () => {
    const app = buildApp({ serviceRoleKey: () => SERVICE_KEY });
    const res = await app.request("/v1/admin/backfill-thumbnails", {
      method: "POST",
      headers: { Authorization: `Bearer ${SERVICE_KEY}` },
    });
    expect(res.status).toBe(501);
  });

  it("invokes backfill and returns its result on valid request", async () => {
    const app = buildApp({
      serviceRoleKey: () => SERVICE_KEY,
      backfill: async () => ({ processed: 7, errors: 0 }),
    });
    const res = await app.request("/v1/admin/backfill-thumbnails", {
      method: "POST",
      headers: { Authorization: `Bearer ${SERVICE_KEY}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { processed: number; errors: number };
    expect(body).toEqual({ processed: 7, errors: 0 });
  });
});
