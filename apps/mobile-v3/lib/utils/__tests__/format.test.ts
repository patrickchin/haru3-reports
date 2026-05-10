import { describe, it, expect } from 'vitest';
import {
  formatDate,
  formatDateTime,
  formatDateLong,
  formatCapturedAt,
  formatBytes,
  formatDuration,
  formatDurationSec,
  toTitleCase,
  truncate,
} from '../format';

// ---------------------------------------------------------------------------
// formatDate
// ---------------------------------------------------------------------------

describe('formatDate', () => {
  it('formats an ISO string to short date', () => {
    const result = formatDate('2026-04-15T10:30:00Z');
    expect(result).toContain('Apr');
    expect(result).toContain('15');
    expect(result).toContain('2026');
  });

  it('returns empty string for null', () => {
    expect(formatDate(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(formatDate(undefined)).toBe('');
  });

  it('returns empty string for invalid date', () => {
    expect(formatDate('not-a-date')).toBe('');
  });
});

// ---------------------------------------------------------------------------
// formatDateTime
// ---------------------------------------------------------------------------

describe('formatDateTime', () => {
  it('formats date with time', () => {
    const result = formatDateTime('2026-04-15T10:53:00Z');
    expect(result).toContain('Apr');
    expect(result).toContain('15');
  });

  it('returns empty for null', () => {
    expect(formatDateTime(null)).toBe('');
  });
});

// ---------------------------------------------------------------------------
// formatDateLong
// ---------------------------------------------------------------------------

describe('formatDateLong', () => {
  it('formats to long date with weekday', () => {
    // 2026-04-15 is a Wednesday
    const result = formatDateLong('2026-04-15T10:30:00Z');
    expect(result).toContain('April');
    expect(result).toContain('15');
    expect(result).toContain('2026');
  });

  it('returns empty for null', () => {
    expect(formatDateLong(null)).toBe('');
  });
});

// ---------------------------------------------------------------------------
// formatCapturedAt
// ---------------------------------------------------------------------------

describe('formatCapturedAt', () => {
  it('formats an ISO string', () => {
    const result = formatCapturedAt('2026-05-02T10:53:00Z');
    expect(result.length).toBeGreaterThan(0);
  });

  it('formats a numeric timestamp', () => {
    const ts = new Date('2026-05-02T10:53:00Z').getTime();
    const result = formatCapturedAt(ts);
    expect(result.length).toBeGreaterThan(0);
  });

  it('returns empty for null', () => {
    expect(formatCapturedAt(null)).toBe('');
  });

  it('returns empty for undefined', () => {
    expect(formatCapturedAt(undefined)).toBe('');
  });
});

// ---------------------------------------------------------------------------
// formatBytes
// ---------------------------------------------------------------------------

describe('formatBytes', () => {
  it('formats bytes', () => {
    expect(formatBytes(500)).toBe('500 B');
  });

  it('formats kilobytes', () => {
    expect(formatBytes(1536)).toBe('1.5 KB');
  });

  it('formats megabytes', () => {
    expect(formatBytes(2 * 1024 * 1024)).toBe('2.0 MB');
  });

  it('handles zero', () => {
    expect(formatBytes(0)).toBe('0 B');
  });

  it('handles exactly 1 KB boundary', () => {
    expect(formatBytes(1024)).toBe('1.0 KB');
  });

  it('handles exactly 1 MB boundary', () => {
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB');
  });
});

// ---------------------------------------------------------------------------
// formatDuration
// ---------------------------------------------------------------------------

describe('formatDuration', () => {
  it('formats milliseconds to m:ss', () => {
    expect(formatDuration(187_000)).toBe('3:07');
  });

  it('handles zero', () => {
    expect(formatDuration(0)).toBe('0:00');
  });

  it('handles exactly one minute', () => {
    expect(formatDuration(60_000)).toBe('1:00');
  });

  it('handles sub-minute', () => {
    expect(formatDuration(5_000)).toBe('0:05');
  });

  it('handles large duration', () => {
    expect(formatDuration(3_600_000)).toBe('60:00');
  });
});

// ---------------------------------------------------------------------------
// formatDurationSec
// ---------------------------------------------------------------------------

describe('formatDurationSec', () => {
  it('formats seconds to m:ss', () => {
    expect(formatDurationSec(187)).toBe('3:07');
  });

  it('handles zero', () => {
    expect(formatDurationSec(0)).toBe('0:00');
  });

  it('handles fractional seconds', () => {
    expect(formatDurationSec(65.7)).toBe('1:05');
  });
});

// ---------------------------------------------------------------------------
// toTitleCase
// ---------------------------------------------------------------------------

describe('toTitleCase', () => {
  it('converts snake_case', () => {
    expect(toTitleCase('site_visit')).toBe('Site Visit');
  });

  it('converts kebab-case', () => {
    expect(toTitleCase('daily-report')).toBe('Daily Report');
  });

  it('handles already capitalized', () => {
    expect(toTitleCase('Hello')).toBe('Hello');
  });

  it('handles single word', () => {
    expect(toTitleCase('safety')).toBe('Safety');
  });
});

// ---------------------------------------------------------------------------
// truncate
// ---------------------------------------------------------------------------

describe('truncate', () => {
  it('returns original if within limit', () => {
    expect(truncate('Hello', 10)).toBe('Hello');
  });

  it('truncates with ellipsis', () => {
    expect(truncate('Hello World', 6)).toBe('Hello…');
  });

  it('handles exact length', () => {
    expect(truncate('Hello', 5)).toBe('Hello');
  });

  it('handles empty string', () => {
    expect(truncate('', 5)).toBe('');
  });
});
