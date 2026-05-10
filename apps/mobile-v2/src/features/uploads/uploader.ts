/**
 * Performs a single upload job end-to-end:
 *   1. preprocess (image resize + thumb + blurhash, no-op for non-images)
 *   2. main file URI → Blob
 *   3. upload to Supabase Storage
 *   4. insert file_metadata row
 *   5. on success, optionally insert a report_notes link
 *
 * The runtime (queue.ts) drives this by emitting JobEvents based on the
 * UploaderOutcome and the thrown errors.
 */
import * as ImageManipulator from "expo-image-manipulator";
import { Image as ExpoImage } from "expo-image";
import * as FileSystem from "expo-file-system";
import { supabase } from "@/infra/supabase";
import type { FileMetadata } from "@/infra/db-types";
import type { EnqueueInput } from "./jobs";

export interface UploaderDeps {
  preprocessImage: typeof preprocessImage;
  uriToBlob: typeof uriToBlob;
  uploadToStorage: typeof uploadToStorage;
  insertFileMetadata: typeof insertFileMetadata;
}

export interface UploaderHandlers {
  onPreprocessComplete: (info: {
    workingUri: string;
    thumbnailUri?: string;
    width?: number;
    height?: number;
    blurhash?: string | null;
  }) => void;
  onUploadStart: () => void;
  /** Called occasionally if the underlying transport reports progress. */
  onProgress?: (fraction: number) => void;
  /**
   * Called once when a fresh placeholder row is inserted. The queue
   * records the ids so a subsequent retry can reuse the same row
   * (failed → pending) instead of inserting a duplicate.
   */
  onPlaceholderInserted?: (info: {
    placeholderFileId: string;
    placeholderStoragePath: string;
  }) => void;
}

export interface UploaderResult {
  metadataRow: FileMetadata;
  storagePath: string;
}

/**
 * Run a single upload. Throws on failure (caller catches and decides
 * whether to retry). On success, returns the freshly inserted
 * file_metadata row.
 */
export async function runUploadJob(
  input: EnqueueInput,
  deps: UploaderDeps,
  handlers: UploaderHandlers,
  context: {
    existingPlaceholder?: { fileId: string; storagePath: string };
  } = {},
): Promise<UploaderResult> {
  if (input.kind === "avatar") {
    throw new Error("upload-queue: avatar kind handled separately");
  }
  if (!input.projectId) {
    throw new Error("upload-queue: project upload missing projectId");
  }

  // 1. Preprocess (image only)
  const pre = input.isImage
    ? await deps.preprocessImage(input.sourceUri, input.width, input.height)
    : {
        workingUri: input.sourceUri,
        thumbnailUri: undefined,
        width: input.width,
        height: input.height,
        blurhash: null,
      };
  handlers.onPreprocessComplete(pre);

  // 2. Read working URI as bytes
  const bodyBytes = await deps.uriToBlob(pre.workingUri);

  // 2b. Optional thumbnail bytes
  let thumbnailBytes: Uint8Array | undefined;
  if (pre.thumbnailUri) {
    thumbnailBytes = await deps.uriToBlob(pre.thumbnailUri);
  }

  // 3. Upload
  handlers.onUploadStart();
  const category = categoryFromKind(input.kind);
  const storagePath = await deps.uploadToStorage({
    projectId: input.projectId,
    category,
    filename: input.filename,
    mimeType: input.mimeType,
    body: bodyBytes,
    thumbnail: thumbnailBytes
      ? { body: thumbnailBytes, mimeType: "image/jpeg" }
      : undefined,
    onProgress: handlers.onProgress,
  });

  // 4. Insert file_metadata
  const metadataRow = await deps.insertFileMetadata({
    projectId: input.projectId,
    uploadedBy: input.uploadedBy,
    category,
    filename: input.filename,
    mimeType: input.mimeType,
    sizeBytes: bodyBytes.byteLength,
    storagePath,
    thumbnailPath: thumbnailBytes ? `${storagePath}.thumb.jpg` : null,
    width: pre.width ?? null,
    height: pre.height ?? null,
    blurhash: pre.blurhash ?? null,
    durationMs: input.durationMs ?? null,
  });

  return { metadataRow, storagePath };
}

// ----- Default implementations ----------------------------------------------

const MAX_ORIGINAL_EDGE_PX = 2048;
const MAX_THUMBNAIL_EDGE_PX = 400;
const ORIGINAL_QUALITY = 0.85;
const THUMBNAIL_QUALITY = 0.7;
const BLURHASH_COMPONENTS: [number, number] = [4, 3];

export async function preprocessImage(
  uri: string,
  srcWidth?: number,
  srcHeight?: number,
): Promise<{
  workingUri: string;
  thumbnailUri?: string;
  width?: number;
  height?: number;
  blurhash: string | null;
}> {
  const w = srcWidth ?? 3000;
  const h = srcHeight ?? 4000;

  const originalPlan = planResize(w, h, MAX_ORIGINAL_EDGE_PX);
  const original = await ImageManipulator.manipulateAsync(
    uri,
    originalPlan.resize ? [{ resize: originalPlan.resize }] : [],
    { compress: ORIGINAL_QUALITY, format: ImageManipulator.SaveFormat.JPEG },
  );

  const thumbPlan = planResize(original.width, original.height, MAX_THUMBNAIL_EDGE_PX);
  const thumb = await ImageManipulator.manipulateAsync(
    original.uri,
    thumbPlan.resize ? [{ resize: thumbPlan.resize }] : [],
    { compress: THUMBNAIL_QUALITY, format: ImageManipulator.SaveFormat.JPEG },
  );

  let blurhash: string | null = null;
  try {
    blurhash = await ExpoImage.generateBlurhashAsync(thumb.uri, BLURHASH_COMPONENTS);
  } catch {
    blurhash = null;
  }

  return {
    workingUri: original.uri,
    thumbnailUri: thumb.uri,
    width: original.width,
    height: original.height,
    blurhash,
  };
}

function planResize(
  srcWidth: number,
  srcHeight: number,
  maxEdgePx: number,
): { resize: { width: number; height: number } | null } {
  if (
    !Number.isFinite(srcWidth) ||
    !Number.isFinite(srcHeight) ||
    srcWidth <= 0 ||
    srcHeight <= 0
  ) {
    return { resize: null };
  }
  const longEdge = Math.max(srcWidth, srcHeight);
  if (longEdge <= maxEdgePx) return { resize: null };
  const scale = maxEdgePx / longEdge;
  return {
    resize: {
      width: Math.round(srcWidth * scale),
      height: Math.round(srcHeight * scale),
    },
  };
}

/**
 * Convert a local asset URI to a `Uint8Array` body suitable for direct
 * upload via `supabase.storage.from(...).upload(path, body)`.
 *
 * Standard-path: uses `expo-file-system` File API (blessed primitive).
 */
export async function uriToBlob(uri: string): Promise<Uint8Array> {
  let resolvedUri = uri;

  // iOS PhotoKit URIs need a cache copy first
  if (uri.startsWith("ph://") || uri.startsWith("assets-library://")) {
    // @ts-expect-error: cacheDirectory exists at runtime but type definitions are incomplete in SDK 55
    const cacheDir = FileSystem.cacheDirectory as string | null;
    if (!cacheDir) throw new Error("uriToBlob: cacheDirectory unavailable");
    const dest = `${cacheDir}upload-${Date.now()}-${randomSuffix()}.jpg`;
    await FileSystem.copyAsync({ from: uri, to: dest });
    resolvedUri = dest;
  }

  const file = new FileSystem.File(resolvedUri);
  return await file.bytes();
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 10);
}

const PROJECT_FILES_BUCKET = "project-files";

const CATEGORY_FOLDER: Record<string, string> = {
  image: "images",
  document: "documents",
  "voice-note": "voice-notes",
  attachment: "attachments",
};

export async function uploadToStorage(params: {
  projectId: string;
  category: string;
  filename: string;
  mimeType: string;
  body: Uint8Array;
  thumbnail?: { body: Uint8Array; mimeType: string };
  onProgress?: (fraction: number) => void;
}): Promise<string> {
  const id = Math.random().toString(36).slice(2, 10);
  const ext = extensionFor(params.filename, params.mimeType);
  const storagePath = `${params.projectId}/${CATEGORY_FOLDER[params.category]}/${id}.${ext}`;
  const bucket = supabase.storage.from(PROJECT_FILES_BUCKET);

  const upload = await bucket.upload(storagePath, params.body, {
    contentType: params.mimeType,
    upsert: false,
  });
  if (upload.error || !upload.data) {
    throw new Error(`Storage upload failed: ${upload.error?.message ?? "unknown"}`);
  }

  // Best-effort thumbnail upload
  if (params.thumbnail) {
    const thumbPath = `${storagePath}.thumb.jpg`;
    await bucket.upload(thumbPath, params.thumbnail.body, {
      contentType: params.thumbnail.mimeType,
      upsert: false,
    });
  }

  return storagePath;
}

export async function insertFileMetadata(params: {
  projectId: string;
  uploadedBy: string;
  category: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  storagePath: string;
  thumbnailPath: string | null;
  width: number | null;
  height: number | null;
  blurhash: string | null;
  durationMs: number | null;
}): Promise<FileMetadata> {
  const { data, error } = await supabase
    .from("file_metadata")
    .insert({
      project_id: params.projectId,
      uploader_id: params.uploadedBy,
      file_name: params.filename,
      file_size: params.sizeBytes,
      mime_type: params.mimeType,
      storage_path: params.storagePath,
      thumbnail_url: params.thumbnailPath,
      // TODO: wire up width, height, blurhash, durationMs once db-types extended
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(`file_metadata insert failed: ${error?.message ?? "unknown"}`);
  }

  return data as FileMetadata;
}

function extensionFor(filename: string, mimeType: string): string {
  const fromName = filename.split(".").pop();
  if (fromName && fromName.length <= 5) return fromName;
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "application/pdf": "pdf",
    "audio/mp4": "m4a",
    "audio/mpeg": "mp3",
  };
  return map[mimeType] ?? "bin";
}

function categoryFromKind(kind: string): string {
  const map: Record<string, string> = {
    photo: "image",
    document: "document",
    voice: "voice-note",
  };
  return map[kind] ?? "attachment";
}

export function getDefaultUploaderDeps(): UploaderDeps {
  return {
    preprocessImage,
    uriToBlob,
    uploadToStorage,
    insertFileMetadata,
  };
}
