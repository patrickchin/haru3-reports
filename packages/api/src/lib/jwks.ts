/**
 * Supabase JWKS fetch + cache.
 *
 * Production verifies user JWTs against Supabase's RS256 public keys.
 * The keys rotate rarely; we cache the JWKS in-process for one hour
 * and lazily refresh on the next miss after expiry.
 *
 * Test environments use HS256 with `TEST_JWT_SECRET` (see auth
 * middleware). `getJwksFromUrl` is therefore only exercised in
 * production / staging.
 */
import { createRemoteJWKSet } from "jose";
import type { JWTVerifyGetKey } from "jose";
import { getEnv } from "../env.js";

const CACHE_TTL_SECONDS = 60 * 60; // 1 hour

let cachedKey: JWTVerifyGetKey | null = null;
let cachedAt = 0;

/**
 * Returns a key resolver compatible with `jose.jwtVerify`. The same
 * resolver is reused across requests — `createRemoteJWKSet` handles
 * its own per-key caching and concurrent fetches.
 */
export function getJwks(): JWTVerifyGetKey {
  const now = Math.floor(Date.now() / 1000);
  if (cachedKey && now - cachedAt < CACHE_TTL_SECONDS) {
    return cachedKey;
  }
  const env = getEnv();
  if (!env.SUPABASE_URL) {
    throw new Error(
      "SUPABASE_URL is not set; cannot resolve Supabase JWKS",
    );
  }
  const url = new URL("/auth/v1/.well-known/jwks.json", env.SUPABASE_URL);
  cachedKey = createRemoteJWKSet(url, {
    cooldownDuration: 30_000,
    cacheMaxAge: CACHE_TTL_SECONDS * 1000,
  });
  cachedAt = now;
  return cachedKey;
}

/** Test-only: clear the cache between suites. */
export function resetJwksForTesting(): void {
  cachedKey = null;
  cachedAt = 0;
}
