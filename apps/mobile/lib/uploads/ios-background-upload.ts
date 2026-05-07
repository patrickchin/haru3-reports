/**
 * iOS background upload path.
 *
 * Why this file exists: the foreground-uriToBlob → bucket.upload(blob)
 * flow in `lib/file-upload.ts` requires the JS runtime to stay alive
 * for the whole HTTPS request. iOS aggressively suspends backgrounded
 * apps within ~30s, so any in-flight Supabase upload will be torn down
 * if the user switches apps mid-burst.
 *
 * The fix is to hand the request to NSURLSession via
 * `expo-file-system/legacy`'s `createUploadTask` with
 * `FileSystemSessionType.BACKGROUND`. The OS owns the socket and
 * delivers the response back to us when we relaunch.
 *
 * Auth is handled with a one-shot signed upload URL minted via
 * `bucket.createSignedUploadUrl(path)` — no Bearer token needed on the
 * PUT, which means the request survives session-token refreshes.
 *
 * Thumbnails are tiny (<50KB) and best-effort, so we keep them on the
 * normal foreground path; they're not worth a second background task.
 *
 * Mirrors `uploadProjectFile`'s public contract so the queue runtime
 * can swap implementations without caring which one ran.
 */
import {
  PROJECT_FILES_BUCKET,
  type BackendLike,
  type FileMetadataRow,
  type UploadedFile,
} from "@/lib/file-upload";
import {
  extensionFor,
  validateFile,
  type FileCategory,
} from "@/lib/file-validation";
import { safeRandomUUID } from "@/lib/uuid";

const CATEGORY_FOLDER: Record<Exclude<FileCategory, "avatar">, string> = {
  document: "documents",
  image: "images",
  "voice-note": "voice-notes",
  attachment: "attachments",
  icon: "icons",
};

// ----- Types -----------------------------------------------------------------

export interface BackgroundUploadArgs {
  signedUrl: string;
  fileUri: string;
  mimeType: string;
  onProgress?: (fraction: number) => void;
}

/**
 * Injected adapter wrapping
 *   FileSystem.createUploadTask(signedUrl, fileUri, {
 *     httpMethod: "PUT",
 *     uploadType: FileSystemUploadType.BINARY_CONTENT,
 *     sessionType: FileSystemSessionType.BACKGROUND,
 *     mimeType,
 *   })
 * Resolves on 2xx; rejects with a descriptive Error otherwise.
 */
export type UploadViaBackgroundSession = (
  args: BackgroundUploadArgs,
) => Promise<void>;

export interface BackgroundUploadParams {
  backend: BackendLike;
  projectId: string;
  uploadedBy: string;
  category: Exclude<FileCategory, "avatar">;
  /** Local file URI handed to NSURLSession verbatim. */
  fileUri: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  durationMs?: number | null;
  width?: number | null;
  height?: number | null;
  blurhash?: string | null;
  /**
   * Foreground-uploaded thumbnail bytes (small JPEG). Optional. When
   * present, uploaded via the normal `bucket.upload` path so we don't
   * spawn a second background task for ~10KB.
   */
  thumbnail?: {
    body: Blob | ArrayBuffer | Uint8Array;
    mimeType: string;
    sizeBytes: number;
  } | null;
  uuid?: () => string;
  onProgress?: (fraction: number) => void;
}

export interface BackgroundUploadDeps {
  uploadViaBackgroundSession: UploadViaBackgroundSession;
}

// ----- Implementation --------------------------------------------------------

/**
 * Upload a project-scoped file using an iOS background session, then
 * insert its file_metadata row. Rolls back the storage object on
 * insert failure (mirrors `uploadProjectFile`).
 */
export async function uploadProjectFileViaBackground(
  params: BackgroundUploadParams,
  deps: BackgroundUploadDeps,
): Promise<UploadedFile> {
  const validation = validateFile(params.category, {
    mimeType: params.mimeType,
    sizeBytes: params.sizeBytes,
  });
  if (!validation.valid) throw new Error(validation.reason);

  const id = (params.uuid ?? defaultUuid)();
  const ext = extensionFor(params.filename, params.mimeType);
  const storagePath = `${params.projectId}/${CATEGORY_FOLDER[params.category]}/${id}.${ext}`;
  const bucket = params.backend.storage.from(PROJECT_FILES_BUCKET);

  // 1. Mint a one-shot signed upload URL.
  const signed = await bucket.createSignedUploadUrl(storagePath);
  if (signed.error || !signed.data) {
    throw new Error(
      `Signed upload URL failed: ${signed.error?.message ?? "unknown"}`,
    );
  }

  // 2. Hand the PUT to NSURLSession via the injected adapter.
  try {
    await deps.uploadViaBackgroundSession({
      signedUrl: signed.data.signedUrl,
      fileUri: params.fileUri,
      mimeType: params.mimeType,
      onProgress: params.onProgress,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Background upload failed: ${message}`);
  }

  // 3. Best-effort thumbnail (foreground path — bytes are tiny).
  let thumbnailPath: string | null = null;
  if (params.thumbnail) {
    const thumbStoragePath = `${storagePath}.thumb.jpg`;
    const thumbResult = await bucket.upload(thumbStoragePath, params.thumbnail.body, {
      contentType: params.thumbnail.mimeType,
      upsert: false,
    });
    if (!thumbResult.error && thumbResult.data) {
      thumbnailPath = thumbStoragePath;
    }
  }

  // 4. Insert file_metadata. Rolls back on failure.
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
      width: params.width ?? null,
      height: params.height ?? null,
      thumbnail_path: thumbnailPath,
      blurhash: params.blurhash ?? null,
    })
    .select("*")
    .single();

  if (insertResult.error || !insertResult.data) {
    try {
      const paths = thumbnailPath ? [storagePath, thumbnailPath] : [storagePath];
      await bucket.remove(paths);
    } catch {
      // Best-effort; the original insert error is what matters.
    }
    throw new Error(
      `file_metadata insert failed: ${insertResult.error?.message ?? "unknown"}`,
    );
  }

  return {
    metadata: insertResult.data as FileMetadataRow,
    storagePath,
  };
}

// ----- Internal --------------------------------------------------------------

function defaultUuid(): string {
  return safeRandomUUID();
}
