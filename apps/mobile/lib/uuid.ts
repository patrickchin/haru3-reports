/**
 * Safe wrapper around `crypto.randomUUID()`.
 *
 * Hermes release builds on iOS do not always expose `globalThis.crypto`
 * (this caused `TypeError: Cannot read property 'randomUUID' of undefined`
 * when tapping "New Report"). We guard the lookup and fall back to a
 * Math.random-derived RFC 4122 v4-shaped id. Using a real UUID shape is
 * required because `optimisticId` is also used directly as the
 * `reports.id` (uuid column) on the optimistic insert — anything that
 * doesn't parse as a uuid causes Postgres to reject the row with 400.
 */
export function safeRandomUUID(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  // RFC 4122 v4 fallback (Math.random — non-cryptographic but uuid-shaped).
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
