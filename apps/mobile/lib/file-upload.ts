/**
 * File upload + delete primitives.
 *
 * Designed to be unit-testable: takes a typed `BackendLike` so tests can
 * substitute a `vi.fn()` mock (mirrors `lib/draft-report-actions.ts`).
 *
 * In production the dependency is `lib/backend.ts`'s real Supabase client,
 * which satisfies this shape via duck typing.
 */
import {
  extensionFor,
  validateFile,
  type FileCategory,
} from "./file-validation";

// ----- Types -----------------------------------------------------------------

export type FileMetadataRow = {
  id: string;
  project_id: string;
  uploaded_by: string;
  bucket: string;
  storage_path: string;
  category: FileCategory;
  filename: string;
  mime_type: string;
  size_bytes: number;
  duration_ms: number | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

type StorageUploadOptions = { contentType?: string; upsert?: boolean };

type StorageBucketLike = {
  upload: (
    path: string,
    body: Blob | ArrayBuffer | Uint8Array,
    options?: StorageUploadOptions,
  ) => PromiseLike<{ data: { path: string } | null; error: { message: string } | null }>;
  remove: (
    paths: string[],
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
  createSignedUrl: (
    path: string,
    expiresIn: number,
  ) => PromiseLike<{ data: { signedUrl: string } | null; error: { message: string } | null }>;
  getPublicUrl: (path: string) => { data: { publicUrl: string } };
};

type SingleResult<T> = {
  data: T | null;
  error: { message: string; code?: string } | null;
};

type SelectChain<T> = {
  select: (cols?: string) => { single: () => PromiseLike<SingleResult<T>> };
};

type FileMetadataFromTable = {
  insert: (
    row: Omit<
      FileMetadataRow,
      "id" | "created_at" | "updated_at" | "deleted_at" | "duration_ms" | "bucket"
    > & {
      duration_ms?: number | null;
      bucket?: string;
    },
  ) => SelectChain<FileMetadataRow>;
  update: (patch: Partial<FileMetadataRow>) => {
    eq: (column: "id", value: string) => SelectChain<FileMetadataRow>;
  };
  delete: () => {
    eq: (column: "id", value: string) => PromiseLike<SingleResult<null>>;
  };
};

export type BackendLike = {
  storage: { from: (bucket: string) => StorageBucketLike };
  from: (table: "file_metadata") => FileMetadataFromTable;
};

// ----- Public API ------------------------------------------------------------

export type UploadParams = {
  backend: BackendLike;
  projectId: string;
  uploadedBy: string;
  category: Exclude<FileCategory, "avatar">;
  /** Raw bytes to upload (caller reads from URI via expo-file-system). */
  body: Blob | ArrayBuffer | Uint8Array;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  /** Optional voice-note duration in milliseconds. */
  durationMs?: number | null;
  /** UUID generator override for deterministic tests. */
  uuid?: () => string;
};

export type UploadedFile = {
  metadata: FileMetadataRow;
  storagePath: string;
};

export const PROJECT_FILES_BUCKET = "project-files";
export const AVATARS_BUCKET = "avatars";

const CATEGORY_FOLDER: Record<Exclude<FileCategory, "avatar">, string> = {
  document: "documents",
  image: "images",
  "voice-note": "voice-notes",
  attachment: "attachments",
  icon: "icons",
};

/**
 * Upload a project-scoped file and create its file_metadata row.
 *
 * Path layout: `{project_id}/{categoryFolder}/{uuid}.{ext}`
 *
 * Rolls back the storage object if the metadata insert fails (so we never
 * end up with orphaned blobs the user can't see).
 */
export async function uploadProjectFile(params: UploadParams): Promise<UploadedFile> {
  const validation = validateFile(params.category, {
    mimeType: params.mimeType,
    sizeBytes: params.sizeBytes,
  });
  if (!validation.valid) throw new Error(validation.reason);

  const id = (params.uuid ?? defaultUuid)();
  const ext = extensionFor(params.filename, params.mimeType);
  const storagePath = `${params.projectId}/${CATEGORY_FOLDER[params.category]}/${id}.${ext}`;
  const bucket = params.backend.storage.from(PROJECT_FILES_BUCKET);

  const upload = await bucket.upload(storagePath, params.body, {
    contentType: params.mimeType,
    upsert: false,
  });
  if (upload.error || !upload.data) {
    throw new Error(`Storage upload failed: ${upload.error?.message ?? "unknown"}`);
  }

  const insertResult = await params.backend
    .from("file_metadata")
    .insert({
      project_id: params.projectId,
      uploaded_by: params.uploadedBy,
      category: params.category,
      storage_path: storagePath,
      filename: params.filename,
      mime_type: params.mimeType,
      size_bytes: params.sizeBytes,
      duration_ms: params.durationMs ?? null,
    })
    .select("*")
    .single();

  if (insertResult.error || !insertResult.data) {
    // Roll back the orphaned storage object — best-effort.
    try {
      await bucket.remove([storagePath]);
    } catch {
      // Swallow rollback errors; the original insert error is what matters.
    }
    throw new Error(
      `file_metadata insert failed: ${insertResult.error?.message ?? "unknown"}`,
    );
  }

  return { metadata: insertResult.data, storagePath };
}

export type AvatarUploadParams = {
  backend: BackendLike;
  userId: string;
  body: Blob | ArrayBuffer | Uint8Array;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  uuid?: () => string;
};

/** Upload to the public `avatars` bucket. Returns the public URL. */
export async function uploadAvatar(
  params: AvatarUploadParams,
): Promise<{ storagePath: string; publicUrl: string }> {
  const validation = validateFile("avatar", {
    mimeType: params.mimeType,
    sizeBytes: params.sizeBytes,
  });
  if (!validation.valid) throw new Error(validation.reason);

  const id = (params.uuid ?? defaultUuid)();
  const ext = extensionFor(params.filename, params.mimeType);
  const storagePath = `${params.userId}/${id}.${ext}`;
  const bucket = params.backend.storage.from(AVATARS_BUCKET);

  const upload = await bucket.upload(storagePath, params.body, {
    contentType: params.mimeType,
    upsert: true, // avatars overwrite the previous file
  });
  if (upload.error) {
    throw new Error(`Avatar upload failed: ${upload.error.message}`);
  }

  const { data } = bucket.getPublicUrl(storagePath);
  return { storagePath, publicUrl: data.publicUrl };
}

/** Get a signed URL for a private file (default 1 hour). */
export async function getSignedUrl(
  backend: BackendLike,
  storagePath: string,
  expiresIn = 3600,
): Promise<string> {
  const { data, error } = await backend.storage
    .from(PROJECT_FILES_BUCKET)
    .createSignedUrl(storagePath, expiresIn);
  if (error || !data) {
    throw new Error(`Signed URL failed: ${error?.message ?? "unknown"}`);
  }
  return data.signedUrl;
}

/**
 * Hard-delete a file (storage object + metadata row).
 *
 * Order matters: delete the metadata row first (RLS-protected). If that
 * succeeds but storage delete fails, the orphan can be cleaned up by an
 * admin job; the row is gone so users won't see a broken link.
 */
export async function deleteProjectFile(
  backend: BackendLike,
  fileId: string,
  storagePath: string,
): Promise<void> {
  const metaResult = await backend
    .from("file_metadata")
    .delete()
    .eq("id", fileId);
  if (metaResult.error) {
    throw new Error(`file_metadata delete failed: ${metaResult.error.message}`);
  }

  const storageResult = await backend.storage
    .from(PROJECT_FILES_BUCKET)
    .remove([storagePath]);
  if (storageResult.error) {
    throw new Error(`Storage remove failed: ${storageResult.error.message}`);
  }
}

// ----- Internal --------------------------------------------------------------

function defaultUuid(): string {
  // Node 20 / RN 0.83 both expose globalThis.crypto.randomUUID.
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  // Last-resort fallback.
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
}
