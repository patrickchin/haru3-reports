/**
 * Sliding-/fixed-window rate-limit middleware.
 *
 * Two stores ship with the API:
 *   - {@link MemoryRateLimitStore}: per-process Map; fine for a single
 *     `min_machines_running=1` Fly.io app.
 *   - {@link UpstashRateLimitStore}: atomic INCR+PEXPIRE over Upstash
 *     Redis REST. Required once the API scales horizontally.
 *
 * The middleware itself is store-agnostic: it calls `store.hit(key, now, windowMs)`
 * and never read-modify-writes (which would race across machines).
 *
 * Identifier defaults to the client IP from `x-forwarded-for` (Fly sets this).
 * Pass `keyFn` to scope by user ID, API key, or anything else.
 */
import type { Context, MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";

export interface RateLimitHit {
  /** Number of requests this caller has made within the current window. */
  count: number;
  /** Epoch ms at which the current window started. */
  windowStart: number;
}

export interface RateLimitStore {
  /**
   * Atomically record a hit for `key` and return the resulting count plus
   * the start of the bucket the hit landed in. Implementations should
   * align buckets on `Math.floor(now / windowMs) * windowMs` so that
   * separate processes agree on which window a timestamp belongs to.
   */
  hit(
    key: string,
    now: number,
    windowMs: number,
  ): RateLimitHit | Promise<RateLimitHit>;
}

/**
 * In-process store. Single map; mutated atomically inside the JS event
 * loop so no further locking needed.
 */
export class MemoryRateLimitStore implements RateLimitStore {
  private readonly buckets = new Map<string, RateLimitHit>();

  hit(key: string, now: number, windowMs: number): RateLimitHit {
    const windowStart = Math.floor(now / windowMs) * windowMs;
    const bucketKey = `${key}:${windowStart}`;
    const existing = this.buckets.get(bucketKey);
    const next: RateLimitHit = existing
      ? { count: existing.count + 1, windowStart }
      : { count: 1, windowStart };
    this.buckets.set(bucketKey, next);
    // Best-effort eviction so the map doesn't grow unbounded.
    if (this.buckets.size > 10_000) this.evictOlderThan(now - windowMs * 2);
    return next;
  }

  private evictOlderThan(threshold: number): void {
    for (const [k, v] of this.buckets) {
      if (v.windowStart < threshold) this.buckets.delete(k);
    }
  }
}

/**
 * Minimal interface satisfied by `@upstash/redis`'s `Redis` client.
 * Declared here so tests can pass a fake without importing the SDK.
 */
export interface RedisLike {
  incr(key: string): Promise<number>;
  pexpire(key: string, ms: number): Promise<unknown>;
}

/**
 * Upstash Redis REST-backed store. Uses atomic INCR + PEXPIRE so two
 * machines behind the same load-balancer see one shared counter.
 */
export class UpstashRateLimitStore implements RateLimitStore {
  constructor(private readonly redis: RedisLike) {}

  async hit(
    key: string,
    now: number,
    windowMs: number,
  ): Promise<RateLimitHit> {
    const windowStart = Math.floor(now / windowMs) * windowMs;
    const redisKey = `rl:${key}:${windowStart}`;
    const count = await this.redis.incr(redisKey);
    if (count === 1) {
      // First hit in this bucket — set TTL so the key self-cleans.
      await this.redis.pexpire(redisKey, windowMs);
    }
    return { count, windowStart };
  }
}

export interface RateLimitOptions {
  /** Max requests per window. */
  readonly max: number;
  /** Window length in milliseconds. */
  readonly windowMs: number;
  /** Builds the bucket key. Default: client IP. */
  readonly keyFn?: (c: Context) => string;
  /** Inject a custom store (default: per-instance in-memory). */
  readonly store?: RateLimitStore;
  /** Override `Date.now` for tests. */
  readonly now?: () => number;
}

export function clientIp(c: Context): string {
  const xff = c.req.header("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return c.req.header("cf-connecting-ip") ?? "unknown";
}

const DEFAULT_KEY_FN = (c: Context): string => clientIp(c);

/**
 * Creates a rate-limit middleware. Returns 429 with a structured error
 * body once the bucket exceeds `max` within `windowMs`.
 */
export function rateLimit(opts: RateLimitOptions): MiddlewareHandler {
  const store = opts.store ?? new MemoryRateLimitStore();
  const keyFn = opts.keyFn ?? DEFAULT_KEY_FN;
  const now = opts.now ?? Date.now;

  return async (c, next) => {
    const key = keyFn(c);
    const { count } = await store.hit(key, now(), opts.windowMs);

    if (count > opts.max) {
      throw new HTTPException(429, {
        message: "Rate limit exceeded — try again later",
      });
    }
    return next();
  };
}
