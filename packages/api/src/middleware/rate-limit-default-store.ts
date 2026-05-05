/**
 * Returns the shared Upstash-backed {@link RateLimitStore} for the
 * running process, OR `undefined` when Upstash is not configured. The
 * caller is expected to fall back to a fresh in-memory store in that
 * case (which is what the `rateLimit()` middleware does by default).
 *
 * Why "shared" only for Upstash: tests rely on each rate-limited route
 * getting its own counter so they don't leak state into each other. A
 * shared in-memory store would break that. A shared Upstash store is
 * mandatory because that's the whole point — one counter across all
 * machines.
 */
import { Redis } from "@upstash/redis";
import { getEnv } from "../env.js";
import {
  UpstashRateLimitStore,
  type RateLimitStore,
} from "./rate-limit.js";

let cached: RateLimitStore | null = null;

export function getDefaultRateLimitStore(): RateLimitStore | undefined {
  if (cached) return cached;
  const env = getEnv();
  if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) {
    return undefined;
  }
  const redis = new Redis({
    url: env.UPSTASH_REDIS_REST_URL,
    token: env.UPSTASH_REDIS_REST_TOKEN,
  });
  cached = new UpstashRateLimitStore(redis);
  return cached;
}

/** Test-only: drop the cached store so a different env can be applied. */
export function resetRateLimitStoreForTesting(): void {
  cached = null;
}
