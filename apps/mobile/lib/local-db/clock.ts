/**
 * Test-friendly time + id sources. Production callers pass the real
 * `Date.now()` and `crypto.randomUUID()`; tests pass deterministic stubs.
 */
export type Clock = () => string;
export type IdGen = () => string;

export const isoClock: Clock = () => new Date().toISOString();

/**
 * UUIDv7-ish generator using crypto.randomUUID where available. Sufficient
 * for client-side ids — server enforces uniqueness via primary keys. Falls
 * back to a Math.random-based form for older runtimes (still 32 hex chars).
 */
export const randomId: IdGen = () => {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  // Hex-ish fallback. Not cryptographically secure; only used pre-RN-19.
  const bytes = new Uint8Array(16);
  for (let i = 0; i < bytes.length; i++) bytes[i] = (Math.random() * 256) & 0xff;
  // Set version 4 + variant bits so it is RFC 4122 compliant.
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
    "",
  );
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};
