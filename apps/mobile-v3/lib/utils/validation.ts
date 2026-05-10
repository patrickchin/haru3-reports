/**
 * Validation utilities — file validation, phone normalization, and
 * form-level checks.
 *
 * No Zod dependency to match v1 — uses plain functions and types.
 */

// ---------------------------------------------------------------------------
// File validation
// ---------------------------------------------------------------------------

export type FileCategory =
  | 'document'
  | 'image'
  | 'voice-note'
  | 'attachment'
  | 'icon'
  | 'avatar';

export type ValidationResult =
  | { valid: true }
  | { valid: false; reason: string };

interface CategoryRule {
  maxSizeBytes: number;
  allowedMimeTypes: readonly string[];
}

/** Per-category file size & mime constraints. */
export const FILE_LIMITS: Record<FileCategory, CategoryRule> = {
  image: {
    maxSizeBytes: 20 * 1024 * 1024, // 20 MB
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp'],
  },
  'voice-note': {
    maxSizeBytes: 100 * 1024 * 1024, // 100 MB
    allowedMimeTypes: ['audio/m4a', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/x-m4a'],
  },
  document: {
    maxSizeBytes: 50 * 1024 * 1024, // 50 MB
    allowedMimeTypes: [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain',
      'text/csv',
    ],
  },
  attachment: {
    maxSizeBytes: 50 * 1024 * 1024,
    allowedMimeTypes: [], // any mime type
  },
  icon: {
    maxSizeBytes: 2 * 1024 * 1024,
    allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
  },
  avatar: {
    maxSizeBytes: 5 * 1024 * 1024,
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
  },
};

/**
 * Validate file against category constraints.
 */
export function validateFile(
  category: FileCategory,
  file: { mimeType: string; sizeBytes: number },
): ValidationResult {
  const rule = FILE_LIMITS[category];

  if (file.sizeBytes > rule.maxSizeBytes) {
    const maxMB = (rule.maxSizeBytes / (1024 * 1024)).toFixed(0);
    return { valid: false, reason: `File too large (max ${maxMB} MB)` };
  }

  if (rule.allowedMimeTypes.length > 0 && !rule.allowedMimeTypes.includes(file.mimeType)) {
    return { valid: false, reason: `File type not allowed: ${file.mimeType}` };
  }

  return { valid: true };
}

// ---------------------------------------------------------------------------
// Phone validation
// ---------------------------------------------------------------------------

const PHONE_REGEX = /^\+[1-9]\d{7,14}$/;

/**
 * Normalize phone input — strip spaces, dashes, parens; ensure leading `+`.
 */
export function normalizePhoneNumber(value: string): string {
  return value.replace(/[\s\-()]/g, '');
}

/**
 * Check if phone matches E.164 pattern: +[1-9][0-9]{7,14}.
 */
export function isValidPhoneNumber(value: string): boolean {
  return PHONE_REGEX.test(normalizePhoneNumber(value));
}

/**
 * Returns canonical phone or null.
 */
export function getCanonicalPhoneNumber(value: string): string | null {
  const normalized = normalizePhoneNumber(value);
  return PHONE_REGEX.test(normalized) ? normalized : null;
}

// ---------------------------------------------------------------------------
// Form validation helpers
// ---------------------------------------------------------------------------

/**
 * Validate a project name (non-empty, max 200 chars).
 */
export function validateProjectName(name: string): ValidationResult {
  const trimmed = name.trim();
  if (!trimmed) return { valid: false, reason: 'Project name is required' };
  if (trimmed.length > 200) return { valid: false, reason: 'Name must be under 200 characters' };
  return { valid: true };
}

/**
 * Validate a report title (non-empty, max 300 chars).
 */
export function validateReportTitle(title: string): ValidationResult {
  const trimmed = title.trim();
  if (!trimmed) return { valid: false, reason: 'Report title is required' };
  if (trimmed.length > 300) return { valid: false, reason: 'Title must be under 300 characters' };
  return { valid: true };
}
