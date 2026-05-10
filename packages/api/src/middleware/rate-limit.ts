import type { MiddlewareHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';

interface RateLimitOptions {
  /** Max requests per window */
  limit: number;
  /** Window duration in milliseconds */
  windowMs: number;
}

// In-memory store — entries auto-expire via cleanup
const store = new Map<string, number[]>();

// Periodic cleanup every 60s
const CLEANUP_INTERVAL = 60_000;
let cleanupTimer: ReturnType<typeof setInterval> | undefined;

function startCleanup(windowMs: number) {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, timestamps] of store) {
      const valid = timestamps.filter((t) => now - t < windowMs);
      if (valid.length === 0) store.delete(key);
      else store.set(key, valid);
    }
  }, CLEANUP_INTERVAL);
  // Don't block process exit
  if (cleanupTimer.unref) cleanupTimer.unref();
}

export function rateLimit(opts: RateLimitOptions): MiddlewareHandler {
  startCleanup(opts.windowMs);

  return async (c, next) => {
    // Key by IP + path prefix
    const ip =
      c.req.header('x-forwarded-for') ??
      c.req.header('x-real-ip') ??
      'unknown';
    const key = `${ip}:${c.req.path}`;
    const now = Date.now();

    const timestamps = (store.get(key) ?? []).filter(
      (t) => now - t < opts.windowMs,
    );

    if (timestamps.length >= opts.limit) {
      // Set rate limit headers before rejecting
      const resetAt = Math.ceil((timestamps[0] + opts.windowMs) / 1000);
      c.header('X-RateLimit-Limit', String(opts.limit));
      c.header('X-RateLimit-Remaining', '0');
      c.header('X-RateLimit-Reset', String(resetAt));
      const retryAfter = Math.ceil(
        (timestamps[0] + opts.windowMs - now) / 1000,
      );
      c.header('Retry-After', String(retryAfter));
      throw new HTTPException(429, { message: 'Rate limit exceeded' });
    }

    timestamps.push(now);
    store.set(key, timestamps);

    // Set rate limit headers after recording this request
    const remaining = Math.max(0, opts.limit - timestamps.length);
    const resetAt =
      timestamps.length > 0
        ? Math.ceil((timestamps[0] + opts.windowMs) / 1000)
        : Math.ceil((now + opts.windowMs) / 1000);

    c.header('X-RateLimit-Limit', String(opts.limit));
    c.header('X-RateLimit-Remaining', String(remaining));
    c.header('X-RateLimit-Reset', String(resetAt));

    await next();
  };
}

// Standard rate limit tiers
export const standardRateLimit = rateLimit({ limit: 100, windowMs: 60_000 });
export const aiRateLimit = rateLimit({ limit: 10, windowMs: 60_000 });
export const uploadRateLimit = rateLimit({ limit: 30, windowMs: 60_000 });

// Reset store for testing
export function _resetRateLimitStore() {
  store.clear();
}
