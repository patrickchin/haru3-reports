import { describe, expect, it, beforeEach } from "vitest";
import { createApp } from "./app.js";
import { resetEnvForTesting } from "./env.js";
import { resetLoggerForTesting } from "./logger.js";

function freshApp(env: Record<string, string> = {}) {
  resetEnvForTesting();
  resetLoggerForTesting();
  for (const k of [
    "NODE_ENV",
    "PORT",
    "LOG_LEVEL",
    "DATABASE_URL",
    "SUPABASE_URL",
    "ALLOWED_ORIGINS",
  ]) {
    delete process.env[k];
  }
  Object.assign(process.env, env);
  return createApp();
}

describe("app", () => {
  beforeEach(() => {
    resetEnvForTesting();
    resetLoggerForTesting();
  });

  it("returns 200 from /v1/health when DB is not configured", async () => {
    const app = freshApp({ NODE_ENV: "test" });
    const res = await app.request("/v1/health");
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      status: "ok",
      service: "harpa-api",
      db: "not_configured",
      env: "test",
    });
    expect(typeof body.uptimeSeconds).toBe("number");
  });

  it("echoes back X-Request-Id on every response", async () => {
    const app = freshApp({ NODE_ENV: "test" });
    const res = await app.request("/v1/health", {
      headers: { "x-request-id": "test-req-123" },
    });
    expect(res.headers.get("x-request-id")).toBe("test-req-123");
  });

  it("generates a fresh X-Request-Id when none is provided", async () => {
    const app = freshApp({ NODE_ENV: "test" });
    const res = await app.request("/v1/health");
    const id = res.headers.get("x-request-id");
    expect(id).toBeTruthy();
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it("returns 404 with a structured error body for unknown routes", async () => {
    const app = freshApp({ NODE_ENV: "test" });
    const res = await app.request("/v1/does-not-exist");
    expect(res.status).toBe(404);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      error: "not_found",
      message: expect.stringContaining("/v1/does-not-exist"),
    });
    expect(body.requestId).toBeTruthy();
  });
});
