import { randomUUID } from "expo-crypto";

/**
 * RFC 4122 UUID generator safe for Hermes release builds.
 *
 * Hermes on iOS may not expose `globalThis.crypto`. Fallback to
 * expo-crypto which always conforms to RFC 4122. Non-conforming
 * UUID-like strings will silently break PostgREST uuid column queries.
 */
export function newId(): string {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return randomUUID();
}
