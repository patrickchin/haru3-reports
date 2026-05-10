/**
 * Shared date/time formatters for note-style cards (voice notes, photos,
 * text notes). Lives outside any specific component so every card type
 * renders timestamps the same way.
 */

/**
 * Formats an ISO timestamp for display in a note card's header.
 * Uses the device locale so 12h/24h follows the user's settings.
 * Example output: "2 May 2026, 10:53" (en-GB) or "May 2, 2026, 10:53 AM" (en-US).
 *
 * Returns "" for invalid / empty inputs so callers can do
 * `{capturedAt ? <Text>{formatCapturedAt(capturedAt)}</Text> : null}`.
 */
export function formatCapturedAt(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  const d = typeof value === "number" ? new Date(value) : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
