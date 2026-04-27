/**
 * File-upload validation — pure helpers, no side effects.
 *
 * Limits and mime allow-lists are enforced both client-side (this module)
 * and server-side (Supabase Storage bucket file_size_limit / RLS policies).
 *
 * Categories mirror the `category` CHECK constraint in
 * `supabase/migrations/202604270001_file_upload_storage.sql`.
 */

export type FileCategory =
  | "document"
  | "image"
  | "voice-note"
  | "attachment"
  | "icon"
  | "avatar"; // virtual category — uploaded to the `avatars` bucket, no file_metadata row

export type ValidationResult =
  | { valid: true }
  | { valid: false; reason: string };

type CategoryRule = {
  /** Inclusive max bytes (rejected if greater). */
  maxBytes: number;
  /** Exact mime allow-list. Use ["*"] to allow any non-empty mime. */
  mimes: readonly string[];
};

export const FILE_LIMITS: Record<FileCategory, CategoryRule> = {
  "voice-note": {
    maxBytes: 50 * 1024 * 1024,
    mimes: [
      "audio/mp4",
      "audio/m4a",
      "audio/mpeg",
      "audio/wav",
      "audio/x-wav",
      "audio/webm",
      "audio/ogg",
      "audio/x-caf",
    ],
  },
  document: {
    maxBytes: 50 * 1024 * 1024,
    mimes: [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-powerpoint",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "text/plain",
      "text/csv",
    ],
  },
  image: {
    maxBytes: 10 * 1024 * 1024,
    mimes: ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"],
  },
  icon: {
    maxBytes: 5 * 1024 * 1024,
    mimes: ["image/jpeg", "image/png", "image/webp"],
  },
  attachment: {
    maxBytes: 25 * 1024 * 1024,
    mimes: ["*"],
  },
  avatar: {
    maxBytes: 10 * 1024 * 1024,
    mimes: ["image/jpeg", "image/png", "image/webp", "image/heic"],
  },
};

export function validateFile(
  category: FileCategory,
  input: { mimeType: string; sizeBytes: number },
): ValidationResult {
  const rule = FILE_LIMITS[category];
  if (!rule) {
    return { valid: false, reason: `Unknown category: ${category}` };
  }

  const mime = input.mimeType?.trim().toLowerCase();
  if (!mime) {
    return { valid: false, reason: "Missing mime type" };
  }

  if (!Number.isFinite(input.sizeBytes) || input.sizeBytes <= 0) {
    return { valid: false, reason: "File is empty" };
  }

  if (input.sizeBytes > rule.maxBytes) {
    return {
      valid: false,
      reason: `File exceeds ${formatBytes(rule.maxBytes)} limit (${formatBytes(input.sizeBytes)})`,
    };
  }

  if (rule.mimes.length === 1 && rule.mimes[0] === "*") {
    return { valid: true };
  }

  if (!rule.mimes.includes(mime)) {
    return {
      valid: false,
      reason: `Unsupported file type "${mime}" for ${category}`,
    };
  }

  return { valid: true };
}

/**
 * Pick a sensible storage extension for a given mime + filename.
 * Prefers the existing extension when present, falls back to a mime-based default.
 */
export function extensionFor(filename: string, mimeType: string): string {
  const fromName = filename.includes(".") ? filename.split(".").pop()! : "";
  if (fromName && fromName.length <= 5) return fromName.toLowerCase();

  const m = mimeType.toLowerCase();
  if (m === "application/pdf") return "pdf";
  if (m.startsWith("image/")) return m.split("/")[1];
  if (m === "audio/mpeg") return "mp3";
  if (m === "audio/mp4" || m === "audio/m4a") return "m4a";
  if (m === "audio/wav" || m === "audio/x-wav") return "wav";
  if (m === "audio/webm") return "webm";
  if (m === "audio/ogg") return "ogg";
  return "bin";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
