/**
 * Backoff schedule for outbox retry. Exponential with jitter, capped at
 * 30 minutes; permanent failure after `MAX_ATTEMPTS`.
 *
 * Pure function so tests can pass a deterministic `random` source.
 */
const BASE_SECONDS = 30;
const MAX_SECONDS = 30 * 60;
export const MAX_ATTEMPTS = 10;

export type Random = () => number; // [0, 1)

export function nextAttemptDelaySeconds(
  attemptsBefore: number,
  random: Random = Math.random,
): number {
  const exp = Math.min(MAX_SECONDS, BASE_SECONDS * 2 ** attemptsBefore);
  const jitter = 1 + (random() - 0.5) * 0.4; // ±20%
  return Math.max(1, Math.round(exp * jitter));
}

export function isPermanentFailure(attempts: number): boolean {
  return attempts >= MAX_ATTEMPTS;
}
