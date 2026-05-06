/**
 * Tests for the rate-limit middleware.
 */
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { errorHandler } from "./error-handler.js";
import {
  MemoryRateLimitStore,
  UpstashRateLimitStore,
  type RedisLike,
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

  it("honours an injected async (Upstash-style) store", async () => {
    const fakeRedis = makeFakeRedis();
    const store = new UpstashRateLimitStore(fakeRedis);
    const app = buildApp({ max: 2, windowMs: 60_000, store });
    const headers = { "x-forwarded-for": "9.9.9.9" };
    expect((await app.request("/", { headers })).status).toBe(200);
    expect((await app.request("/", { headers })).status).toBe(200);
    expect((await app.request("/", { headers })).status).toBe(429);
  });
});

describe("MemoryRateLimitStore", () => {
  it("aligns buckets on windowMs", () => {
    const s = new MemoryRateLimitStore();
    const a = s.hit("k", 1234, 1000);
    expect(a).toEqual({ count: 1, windowStart: 1000 });
    const b = s.hit("k", 1900, 1000);
    expect(b).toEqual({ count: 2, windowStart: 1000 });
    const c = s.hit("k", 2050, 1000); // new bucket
    expect(c).toEqual({ count: 1, windowStart: 2000 });
  });

  it("isolates keys", () => {
    const s = new MemoryRateLimitStore();
    expect(s.hit("a", 0, 1000).count).toBe(1);
    expect(s.hit("b", 0, 1000).count).toBe(1);
    expect(s.hit("a", 0, 1000).count).toBe(2);
  });
});

describe("UpstashRateLimitStore", () => {
  it("uses INCR and sets PEXPIRE only on first hit per bucket", async () => {
    const fake = makeFakeRedis();
    const store = new UpstashRateLimitStore(fake);

    const r1 = await store.hit("u1", 5_000, 60_000);
    expect(r1).toEqual({ count: 1, windowStart: 0 });
    const r2 = await store.hit("u1", 6_000, 60_000);
    expect(r2).toEqual({ count: 2, windowStart: 0 });

    expect(fake.calls.incr).toEqual(["rl:u1:0", "rl:u1:0"]);
    expect(fake.calls.pexpire).toEqual([["rl:u1:0", 60_000]]); // only first hit
  });

  it("rolls over to a new bucket after windowMs", async () => {
    const fake = makeFakeRedis();
    const store = new UpstashRateLimitStore(fake);
    const a = await store.hit("u1", 0, 1_000);
    const b = await store.hit("u1", 999, 1_000);
    const c = await store.hit("u1", 1_000, 1_000);
    expect(a.count).toBe(1);
    expect(b.count).toBe(2);
    expect(c).toEqual({ count: 1, windowStart: 1_000 });
    expect(fake.calls.pexpire.length).toBe(2); // one per fresh bucket
  });
});

interface FakeRedis extends RedisLike {
  calls: { incr: string[]; pexpire: [string, number][] };
}

function makeFakeRedis(): FakeRedis {
  const counts = new Map<string, number>();
  const calls = { incr: [] as string[], pexpire: [] as [string, number][] };
  return {
    calls,
    incr: async (key: string) => {
      calls.incr.push(key);
      const next = (counts.get(key) ?? 0) + 1;
      counts.set(key, next);
      return next;
    },
    pexpire: async (key: string, ms: number) => {
      calls.pexpire.push([key, ms]);
      return 1;
    },
  };
}
