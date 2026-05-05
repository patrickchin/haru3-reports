/**
 * Sliding-window rate-limit middleware.
 *
 * In-memory implementation — sufficient for the API's `min_machines_running=1`
 * Fly.io deployment. Swap in a Redis-backed store later by satisfying the
 * `RateLimitStore` interface; the middleware does not change.
 *
 * Identifier defaults to the client IP from `x-forwarded-for` (Fly sets this).
 * Pass `keyFn` to scope by user ID, API key, or anything else.
 */
import type { Context, MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";

export interface RateLimitEntry {
  count: number;
  windowStart: number;
}

export interface RateLimitStore {
  get(key: string): RateLimitEntry | undefined;
  set(key: string, entry: RateLimitEntry): void;
}

export class MemoryRateLimitStore implements RateLimitStore {
  private readonly map = new Map<string, RateLimitEntry>();
  get(key: string): RateLimitEntry | undefined {
    return this.map.get(key);
  }
  set(key: string, entry: RateLimitEntry): void {
    this.map.set(key, entry);
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

const DEFAULT_KEY_FN = (c: Context): string => clientIp(c);

export function clientIp(c: Context): string {
  const xff = c.req.header("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return c.req.header("cf-connecting-ip") ?? "unknown";
}

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
    const t = now();
    const entry = store.get(key);

    if (!entry || t - entry.windowStart > opts.windowMs) {
      store.set(key, { count: 1, windowStart: t });
      return next();
    }

    entry.count += 1;
    store.set(key, entry);

    if (entry.count > opts.max) {
      throw new HTTPException(429, {
        message: "Rate limit exceeded — try again later",
      });
    }
    return next();
  };
}
