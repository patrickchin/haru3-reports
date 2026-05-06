/**
 * Integration-style tests for /v1/me — exercises the full middleware
 * chain via the real Hono app factory.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { resetEnvForTesting } from "../env.js";
import { resetLoggerForTesting } from "../logger.js";
import { authHeaders, mintTestJwt } from "../../tests/helpers/auth.js";

const USER_ID = "11111111-2222-3333-4444-555555555555";

beforeEach(() => {
  resetEnvForTesting();
  resetLoggerForTesting();
  process.env.NODE_ENV = "test";
  process.env.TEST_JWT_SECRET = "me-route-secret";
});

describe("/v1/me", () => {
  it("returns 401 without a token", async () => {
    const app = createApp();
    const res = await app.request("/v1/me");
    expect(res.status).toBe(401);
  });

  it("returns the userId from a valid token", async () => {
    const headers = await authHeaders(USER_ID);
    const app = createApp();
    const res = await app.request("/v1/me", { headers });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { userId: string; jwt: { iat: number } };
    expect(body.userId).toBe(USER_ID);
    expect(typeof body.jwt.iat).toBe("number");
  });

  it("returns 401 for a token expired by 1 minute", async () => {
    const token = await mintTestJwt({ sub: USER_ID, exp: "-1m" });
    const app = createApp();
    const res = await app.request("/v1/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(401);
  });
});
