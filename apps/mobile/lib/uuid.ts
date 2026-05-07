/**
 * Safe wrapper around `crypto.randomUUID()`.
 *
 * Hermes release builds on iOS do not always expose `globalThis.crypto`
 * (this caused `TypeError: Cannot read property 'randomUUID' of undefined`
 * when tapping "New Report"). We guard the lookup and fall back to a
 * timestamp + Math.random id, which is good enough for client-side
 * optimistic ids — the server still owns the canonical id.
 */
export function safeRandomUUID(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
}
