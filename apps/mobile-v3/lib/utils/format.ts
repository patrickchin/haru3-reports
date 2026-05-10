/**
 * Formatting utilities — single source of truth for dates, file sizes,
 * durations, and display text.
 *
 * Consolidates the 4 formatDate variants and 2 formatBytes/formatDuration
 * duplicates from v1 into one module.
 */

// ---------------------------------------------------------------------------
// Date formatting
// ---------------------------------------------------------------------------

const SHORT_DATE: Intl.DateTimeFormatOptions = {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
};

const SHORT_DATETIME: Intl.DateTimeFormatOptions = {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
};

const FULL_DATE: Intl.DateTimeFormatOptions = {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  year: 'numeric',
};

const NOTE_TIMESTAMP: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
};

/**
 * Short date — "Apr 15, 2026". Used in lists, cards, detail headers.
 * Matches `report-core`'s `formatDate`.
 */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-US', SHORT_DATE);
  } catch {
    return '';
  }
}

/**
 * Short date+time — "Apr 15, 10:53 AM". Used for usage history.
 */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-US', SHORT_DATETIME);
  } catch {
    return '';
  }
}

/**
 * Full date — "Tuesday, April 15, 2026". Used in PDF/HTML exports.
 */
export function formatDateLong(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-US', FULL_DATE);
  } catch {
    return '';
  }
}

/**
 * Note timestamp — device-locale formatted with date+time.
 * "May 2, 2026, 10:53 AM" (en-US) or "2 May 2026, 10:53" (en-GB).
 */
export function formatCapturedAt(
  value: string | number | null | undefined,
): string {
  if (value == null) return '';
  try {
    const d = typeof value === 'number' ? new Date(value) : new Date(value);
    return d.toLocaleString(undefined, NOTE_TIMESTAMP);
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// File size
// ---------------------------------------------------------------------------

/**
 * Human-readable file size — "1.2 MB", "512 KB", "128 B".
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ---------------------------------------------------------------------------
// Duration
// ---------------------------------------------------------------------------

/**
 * Audio/video duration — "3:07" (mm:ss from milliseconds).
 */
export function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

/**
 * Duration from seconds — "3:07" (mm:ss from seconds).
 */
export function formatDurationSec(seconds: number): string {
  const min = Math.floor(seconds / 60);
  const sec = Math.floor(seconds) % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

/**
 * Title case — "site_visit" → "Site Visit".
 */
export function toTitleCase(value: string): string {
  return value
    .replace(/[_-]/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

/**
 * Truncate text with ellipsis — "Some long text…".
 */
export function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen - 1)}…`;
}
