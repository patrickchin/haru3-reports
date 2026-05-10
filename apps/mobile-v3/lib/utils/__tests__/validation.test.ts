import { describe, it, expect } from 'vitest';
import {
  validateFile,
  normalizePhoneNumber,
  isValidPhoneNumber,
  getCanonicalPhoneNumber,
  validateProjectName,
  validateReportTitle,
  FILE_LIMITS,
} from '../validation';

// ---------------------------------------------------------------------------
// validateFile
// ---------------------------------------------------------------------------

describe('validateFile', () => {
  it('accepts valid image', () => {
    const result = validateFile('image', {
      mimeType: 'image/jpeg',
      sizeBytes: 1024 * 1024,
    });
    expect(result).toEqual({ valid: true });
  });

  it('rejects oversized image', () => {
    const result = validateFile('image', {
      mimeType: 'image/jpeg',
      sizeBytes: 25 * 1024 * 1024,
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toContain('too large');
    }
  });

  it('rejects wrong mime type for image', () => {
    const result = validateFile('image', {
      mimeType: 'application/pdf',
      sizeBytes: 1024,
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toContain('not allowed');
    }
  });

  it('accepts any mime for attachment', () => {
    const result = validateFile('attachment', {
      mimeType: 'application/octet-stream',
      sizeBytes: 1024,
    });
    expect(result).toEqual({ valid: true });
  });

  it('rejects oversized attachment', () => {
    const result = validateFile('attachment', {
      mimeType: 'application/octet-stream',
      sizeBytes: 60 * 1024 * 1024,
    });
    expect(result.valid).toBe(false);
  });

  it('accepts valid voice note', () => {
    const result = validateFile('voice-note', {
      mimeType: 'audio/m4a',
      sizeBytes: 5 * 1024 * 1024,
    });
    expect(result).toEqual({ valid: true });
  });

  it('accepts valid document', () => {
    const result = validateFile('document', {
      mimeType: 'application/pdf',
      sizeBytes: 10 * 1024 * 1024,
    });
    expect(result).toEqual({ valid: true });
  });

  it('rejects invalid document mime', () => {
    const result = validateFile('document', {
      mimeType: 'image/png',
      sizeBytes: 1024,
    });
    expect(result.valid).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// FILE_LIMITS
// ---------------------------------------------------------------------------

describe('FILE_LIMITS', () => {
  it('has entries for all categories', () => {
    const categories = ['image', 'voice-note', 'document', 'attachment', 'icon', 'avatar'];
    for (const cat of categories) {
      expect(FILE_LIMITS[cat as keyof typeof FILE_LIMITS]).toBeDefined();
    }
  });

  it('image max is 20MB', () => {
    expect(FILE_LIMITS.image.maxSizeBytes).toBe(20 * 1024 * 1024);
  });

  it('voice-note max is 100MB', () => {
    expect(FILE_LIMITS['voice-note'].maxSizeBytes).toBe(100 * 1024 * 1024);
  });
});

// ---------------------------------------------------------------------------
// Phone validation
// ---------------------------------------------------------------------------

describe('normalizePhoneNumber', () => {
  it('strips spaces and dashes', () => {
    expect(normalizePhoneNumber('+1 (555) 123-4567')).toBe('+15551234567');
  });

  it('preserves already clean number', () => {
    expect(normalizePhoneNumber('+15551234567')).toBe('+15551234567');
  });
});

describe('isValidPhoneNumber', () => {
  it('accepts valid E.164 number', () => {
    expect(isValidPhoneNumber('+15551234567')).toBe(true);
  });

  it('accepts number with spaces (normalizes)', () => {
    expect(isValidPhoneNumber('+1 555 123 4567')).toBe(true);
  });

  it('rejects number without plus', () => {
    expect(isValidPhoneNumber('15551234567')).toBe(false);
  });

  it('rejects too short', () => {
    expect(isValidPhoneNumber('+123')).toBe(false);
  });

  it('rejects starting with +0', () => {
    expect(isValidPhoneNumber('+05551234567')).toBe(false);
  });

  it('rejects empty', () => {
    expect(isValidPhoneNumber('')).toBe(false);
  });
});

describe('getCanonicalPhoneNumber', () => {
  it('returns normalized number for valid input', () => {
    expect(getCanonicalPhoneNumber('+1 555 123 4567')).toBe('+15551234567');
  });

  it('returns null for invalid input', () => {
    expect(getCanonicalPhoneNumber('not-a-phone')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Form validation
// ---------------------------------------------------------------------------

describe('validateProjectName', () => {
  it('accepts valid name', () => {
    expect(validateProjectName('My Project')).toEqual({ valid: true });
  });

  it('rejects empty', () => {
    const result = validateProjectName('');
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toContain('required');
  });

  it('rejects whitespace only', () => {
    const result = validateProjectName('   ');
    expect(result.valid).toBe(false);
  });

  it('rejects over 200 chars', () => {
    const result = validateProjectName('a'.repeat(201));
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toContain('200');
  });

  it('accepts exactly 200 chars', () => {
    expect(validateProjectName('a'.repeat(200))).toEqual({ valid: true });
  });
});

describe('validateReportTitle', () => {
  it('accepts valid title', () => {
    expect(validateReportTitle('Daily Report')).toEqual({ valid: true });
  });

  it('rejects empty', () => {
    const result = validateReportTitle('');
    expect(result.valid).toBe(false);
  });

  it('rejects over 300 chars', () => {
    const result = validateReportTitle('a'.repeat(301));
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toContain('300');
  });
});
