import * as Crypto from "expo-crypto";

/** Safe wrapper around `crypto.randomUUID()` for Hermes release builds. */
export function safeRandomUUID(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return Crypto.randomUUID();
}
