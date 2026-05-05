/**
 * Tests for the rate-limit middleware.
 */
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { errorHandler } from "./error-handler.js";
import {
  MemoryRateLimitStore,
  clientIp,
  rateLimit,
} from "./rate-limit.js";

function buildApp(opts: Parameters<typeof rateLimit>[0]) {
  const app = new Hono();
  app.use("*", rateLimit(opts));
  app.get("/", (c) => c.json({ ok: true }));
  app.onError(errorHandler);
  return app;
}

describe("rate-limit middleware", () => {
  it("allows requests under the limit", async () => {
    const app = buildApp({ max: 3, windowMs: 1000 });
    for (let i = 0; i < 3; i++) {
      const res = await app.request("/", {
        headers: { "x-forwarded-for": "1.1.1.1" },
      });
      expect(res.status).toBe(200);
    }
  });

  it("returns 429 once the bucket exceeds max", async () => {
    const app = buildApp({ max: 2, windowMs: 60_000 });
    const headers = { "x-forwarded-for": "1.1.1.1" };
    expect((await app.request("/", { headers })).status).toBe(200);
    expect((await app.request("/", { headers })).status).toBe(200);
    const res = await app.request("/", { headers });
    expect(res.status).toBe(429);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBeDefined();
  });

  it("buckets are independent per IP", async () => {
    const app = buildApp({ max: 1, windowMs: 60_000 });
    expect(
      (await app.request("/", { headers: { "x-forwarded-for": "1.1.1.1" } }))
        .status,
    ).toBe(200);
    expect(
      (await app.request("/", { headers: { "x-forwarded-for": "2.2.2.2" } }))
        .status,
    ).toBe(200);
    expect(
      (await app.request("/", { headers: { "x-forwarded-for": "1.1.1.1" } }))
        .status,
    ).toBe(429);
  });

  it("resets after the window elapses", async () => {
    let t = 1_000_000;
    const app = buildApp({ max: 1, windowMs: 1_000, now: () => t });
    const headers = { "x-forwarded-for": "1.1.1.1" };
    expect((await app.request("/", { headers })).status).toBe(200);
    expect((await app.request("/", { headers })).status).toBe(429);
    t += 1_500; // outside the window
    expect((await app.request("/", { headers })).status).toBe(200);
  });

  it("supports a custom keyFn", async () => {
    const app = buildApp({
      max: 1,
      windowMs: 60_000,
      keyFn: (c) => c.req.header("x-user-id") ?? "anon",
    });
    expect(
      (await app.request("/", { headers: { "x-user-id": "u1" } })).status,
    ).toBe(200);
    expect(
      (await app.request("/", { headers: { "x-user-id": "u2" } })).status,
    ).toBe(200);
    expect(
      (await app.request("/", { headers: { "x-user-id": "u1" } })).status,
    ).toBe(429);
  });

  it("clientIp falls back when headers absent", async () => {
    const app = new Hono();
    app.get("/", (c) => c.json({ ip: clientIp(c) }));
    const res = await app.request("/");
    const body = (await res.json()) as { ip: string };
    expect(body.ip).toBe("unknown");
  });
});

describe("MemoryRateLimitStore", () => {
  it("get/set roundtrip", () => {
    const s = new MemoryRateLimitStore();
    expect(s.get("k")).toBeUndefined();
    s.set("k", { count: 5, windowStart: 100 });
    expect(s.get("k")).toEqual({ count: 5, windowStart: 100 });
  });
});
