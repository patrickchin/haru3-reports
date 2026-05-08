/**
 * Performs a single upload job end-to-end:
 *   1. preprocess (image resize + thumb + blurhash, no-op for non-images)
 *   2. main file URI → Blob
 *   3. uploadProjectFile (or uploadAvatar — wired by caller via deps)
 *   4. on success, optionally insert a report_notes link
 *   5. on note-link failure, rollback by deleting the freshly uploaded
 *      file (mirrors the back-compat behaviour of the old useFileUpload).
 *
 * The runtime (queue.ts) drives this by emitting JobEvents based on the
 * UploaderOutcome and the thrown errors.
 */
import {
  deleteProjectFile,
  finalizePlaceholderRow,
  insertPlaceholderRow,
  markPlaceholderRowFailed,
  PROJECT_FILES_BUCKET,
  resetPlaceholderRow,
  uploadProjectFile,
  type BackendLike,
  type FileMetadataRow,
  type PlaceholderRowParams,
} from "@/lib/file-upload";
import { uriToBlob, deleteCacheCopyIfAny, type UriToBlobDeps } from "@/lib/uploads/blob";
import { runPreprocessStep, type PreprocessDeps } from "./preprocess-step";
import type {
  uploadProjectFileViaBackground,
  UploadViaBackgroundSession,
} from "./ios-background-upload";
import type { EnqueueInput } from "./jobs";

export interface UploaderDeps {
  backend: BackendLike;
  uriToBlob: typeof uriToBlob;
  preprocess: PreprocessDeps;
  uploadProjectFile: typeof uploadProjectFile;
  deleteProjectFile: typeof deleteProjectFile;
  /**
   * iOS background path. When BOTH of these are provided, the queue
   * routes the main upload through NSURLSession via
   * `expo-file-system/legacy.createUploadTask` with sessionType
   * BACKGROUND, so the OS can finish the request after the JS runtime
   * is suspended. Android and tests leave these undefined and fall
   * through to the foreground `uploadProjectFile` path.
   */
  uploadProjectFileViaBackground?: typeof uploadProjectFileViaBackground;
  uploadViaBackgroundSession?: UploadViaBackgroundSession;
  /**
   * PR-7b placeholder-row pattern. When true (and the iOS background
   * path is NOT engaged), the uploader inserts a `file_metadata` row
   * with `upload_status='pending'` BEFORE preprocessing so the upload
   * tray (and any UI that opts into pending rows) can render the file
   * optimistically. After the bytes land in Storage the same row is
   * flipped to `completed` with the real `storage_path`. On failure
   * the row is flipped to `failed` so the tray can offer a retry chip.
   * Combining this with the iOS background path is deferred — the
   * background completion handler doesn't yet round-trip back into JS
   * to call `finalizePlaceholderRow`.
   */
  useOptimisticPlaceholder?: boolean;
  /** Test seam — defaults to the helpers in `lib/file-upload.ts`. */
  insertPlaceholderRow?: typeof insertPlaceholderRow;
  finalizePlaceholderRow?: typeof finalizePlaceholderRow;
  markPlaceholderRowFailed?: typeof markPlaceholderRowFailed;
  resetPlaceholderRow?: typeof resetPlaceholderRow;
  /**
   * Test seam for the cache-copy cleanup that runs after every
   * terminal transition. Defaults to the no-throw helper in
   * `lib/uploads/blob.ts`.
   */
  deleteCacheCopyIfAny?: typeof deleteCacheCopyIfAny;
  /** Generator for the optional UUID inside uploadProjectFile (test seam). */
  uuid?: () => string;
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
  metadataRow: FileMetadataRow;
  storagePath: string;
}

/**
 * Run a single upload. Throws on failure (caller catches and decides
 * whether to retry). On success, returns the freshly inserted
 * file_metadata row.
 *
 * The 4xx vs 5xx routing is the *queue's* responsibility — this function
 * just lets the underlying error propagate.
 */
export async function runUploadJob(
  input: EnqueueInput,
  deps: UploaderDeps,
  handlers: UploaderHandlers,
  context: {
    /**
     * Set on retry: the queue passes the placeholder row recorded
     * during the first attempt so we can flip it `failed → pending`
     * instead of inserting a fresh row (avoids duplicate file_metadata
     * leaks per H4 in the media-pipeline review).
     */
    existingPlaceholder?: { fileId: string; storagePath: string };
  } = {},
): Promise<UploaderResult> {
  if (input.kind === "avatar") {
    throw new Error("upload-queue: avatar kind is handled separately");
  }
  if (!input.projectId) {
    throw new Error("upload-queue: project upload missing projectId");
  }

  const useBackground = Boolean(
    deps.uploadProjectFileViaBackground && deps.uploadViaBackgroundSession,
  );
  // Placeholder + background combo not yet supported (see UploaderDeps).
  const usePlaceholder = Boolean(deps.useOptimisticPlaceholder) && !useBackground;

  // PR-7b fast path: insert the placeholder row BEFORE preprocessing so
  // the upload tray can render the row immediately. A heavy resize or a
  // slow disk read no longer hides the in-flight file from the user.
  // On retry, reuse the row recorded during the first attempt instead
  // of inserting a duplicate.
  let placeholder: FileMetadataRow | null = null;
  let placeholderStoragePath: string | null = null;
  if (usePlaceholder) {
    if (context.existingPlaceholder) {
      const reset = deps.resetPlaceholderRow ?? resetPlaceholderRow;
      placeholder = await reset(
        deps.backend,
        context.existingPlaceholder.fileId,
      );
      placeholderStoragePath = context.existingPlaceholder.storagePath;
    } else {
      const insert = deps.insertPlaceholderRow ?? insertPlaceholderRow;
      const placeholderParams: PlaceholderRowParams = {
        backend: deps.backend,
        projectId: input.projectId,
        uploadedBy: input.uploadedBy,
        category: input.category,
        filename: input.filename,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        localUri: input.sourceUri,
        durationMs: input.durationMs ?? null,
        width: input.width ?? null,
        height: input.height ?? null,
        uuid: deps.uuid,
      };
      const out = await insert(placeholderParams);
      placeholder = out.metadata;
      placeholderStoragePath = out.storagePath;
      handlers.onPlaceholderInserted?.({
        placeholderFileId: placeholder.id,
        placeholderStoragePath,
      });
    }
  }

  // Cache copies created by uriToBlob (for ph:// / assets-library://
  // sources) — cleaned up on any terminal transition. Without this, a
  // 20-photo burst leaks ~hundreds of MB of duplicate JPEGs into the
  // iOS cache directory until the OS decides to reclaim them.
  const cacheCopiesToCleanup: { originalUri: string; resolvedUri: string }[] = [];
  const cleanupCacheCopies = async (): Promise<void> => {
    const del = deps.deleteCacheCopyIfAny ?? deleteCacheCopyIfAny;
    await Promise.all(
      cacheCopiesToCleanup.map((c) => del(c.originalUri, c.resolvedUri)),
    );
  };

  try {
    // 1. Preprocess (image only)
    const pre = await runPreprocessStep(input, deps.preprocess);
    handlers.onPreprocessComplete(pre);

    // 2. Read working URI as Blob — only needed for the foreground path.
    let bodyBlob: Blob | null = null;
    if (!useBackground) {
      const out = await deps.uriToBlob(pre.workingUri);
      bodyBlob = out.blob as Blob;
      if (out.resolvedUri !== pre.workingUri) {
        cacheCopiesToCleanup.push({
          originalUri: pre.workingUri,
          resolvedUri: out.resolvedUri,
        });
      }
    }

    // 2b. Optional thumbnail blob (always foreground — bytes are tiny).
    let thumbnail: Parameters<typeof deps.uploadProjectFile>[0]["thumbnail"] = null;
    if (pre.thumbnailUri) {
      const { blob: thumbBlob, resolvedUri: thumbResolved } =
        await deps.uriToBlob(pre.thumbnailUri);
      if (thumbResolved !== pre.thumbnailUri) {
        cacheCopiesToCleanup.push({
          originalUri: pre.thumbnailUri,
          resolvedUri: thumbResolved,
        });
      }
      thumbnail = {
        body: thumbBlob,
        mimeType: "image/jpeg",
        sizeBytes: thumbBlob.size,
      };
    }

    // 3. Upload + insert/update file_metadata.
    handlers.onUploadStart();

    const sizeBytes = bodyBlob?.size ?? input.sizeBytes;

    let metadata: FileMetadataRow;
    let storagePath: string;
    if (usePlaceholder && placeholder && placeholderStoragePath) {
      // Foreground placeholder path: upload bytes to the future
      // storage_path (already encoded in placeholderStoragePath), then
      // flip the row pending → completed via the state-machine trigger.
      const bucket = deps.backend.storage.from(PROJECT_FILES_BUCKET);
      const upload = await bucket.upload(placeholderStoragePath, bodyBlob!, {
        contentType: input.mimeType,
        upsert: false,
      });
      if (upload.error || !upload.data) {
        throw new Error(
          `Storage upload failed: ${upload.error?.message ?? "unknown"}`,
        );
      }
      let thumbnailPath: string | null = null;
      if (thumbnail) {
        const thumbStoragePath = `${placeholderStoragePath}.thumb.jpg`;
        const thumbResult = await bucket.upload(thumbStoragePath, thumbnail.body, {
          contentType: thumbnail.mimeType,
          upsert: false,
        });
        if (!thumbResult.error && thumbResult.data) {
          thumbnailPath = thumbStoragePath;
        }
      }
      const finalize = deps.finalizePlaceholderRow ?? finalizePlaceholderRow;
      metadata = await finalize(deps.backend, placeholder.id, {
        storagePath: placeholderStoragePath,
        thumbnailPath,
        width: pre.width ?? input.width ?? null,
        height: pre.height ?? input.height ?? null,
        blurhash: pre.blurhash ?? null,
      });
      storagePath = placeholderStoragePath;
    } else {
      const out = useBackground
        ? await deps.uploadProjectFileViaBackground!(
            {
              backend: deps.backend,
              projectId: input.projectId,
              uploadedBy: input.uploadedBy,
              category: input.category,
              fileUri: pre.workingUri,
              thumbnail,
              filename: input.filename,
              mimeType: input.mimeType,
              sizeBytes,
              width: pre.width ?? input.width ?? null,
              height: pre.height ?? input.height ?? null,
              blurhash: pre.blurhash ?? null,
              durationMs: input.durationMs ?? null,
              uuid: deps.uuid,
              onProgress: handlers.onProgress,
            },
            { uploadViaBackgroundSession: deps.uploadViaBackgroundSession! },
          )
        : await deps.uploadProjectFile({
            backend: deps.backend,
            projectId: input.projectId,
            uploadedBy: input.uploadedBy,
            category: input.category,
            body: bodyBlob!,
            thumbnail,
            filename: input.filename,
            mimeType: input.mimeType,
            sizeBytes,
            width: pre.width ?? input.width ?? null,
            height: pre.height ?? input.height ?? null,
            blurhash: pre.blurhash ?? null,
            durationMs: input.durationMs ?? null,
            uuid: deps.uuid,
          });
      metadata = out.metadata;
      storagePath = out.storagePath;
    }

    // 4. Optionally link a report_notes row (image / document / attachment).
    const noteKind = noteKindForCategory(input.category);
    if (input.reportId && noteKind) {
      try {
        await insertReportNoteLink(deps.backend, {
          reportId: input.reportId,
          projectId: input.projectId,
          authorId: input.uploadedBy,
          kind: noteKind,
          fileId: metadata.id,
        });
      } catch (err) {
        // 5. Rollback uploaded bytes + metadata row.
        await deps
          .deleteProjectFile(
            deps.backend,
            metadata.id,
            storagePath,
            metadata.thumbnail_path ?? null,
          )
          .catch(() => {
            // best-effort; orphan-cleanup job sweeps stragglers.
          });
        throw err;
      }
    }

    return { metadataRow: metadata, storagePath };
  } catch (err) {
    // PR-7b: surface the failure on the placeholder row so the upload
    // tray can show a retry chip. Best-effort — the original error is
    // what the queue cares about.
    if (placeholder) {
      const fail = deps.markPlaceholderRowFailed ?? markPlaceholderRowFailed;
      await fail(deps.backend, placeholder.id).catch(() => {
        // ignore; queue already has the original error
      });
    }
    throw err;
  } finally {
    // M2: cache-copy cleanup runs on every terminal transition
    // (success, fail, or thrown rollback) so ph:// burst captures
    // don't leak into the iOS cache directory.
    await cleanupCacheCopies();
  }
}

// ---------------------------------------------------------------
// Internals
// ---------------------------------------------------------------

type NoteKindForCategoryReturn = "image" | "document" | null;

function noteKindForCategory(
  category: EnqueueInput["category"],
): NoteKindForCategoryReturn {
  switch (category) {
    case "image":
      return "image";
    case "document":
    case "attachment":
      return "document";
    case "voice-note":
    case "icon":
      return null;
  }
}

async function insertReportNoteLink(
  backend: BackendLike,
  args: {
    reportId: string;
    projectId: string;
    authorId: string;
    kind: "image" | "document";
    fileId: string;
  },
): Promise<void> {
  // Auto-position: max(position) + 1 among non-deleted notes for the
  // report. Concurrent inserts can collide on the (report_id, position)
  // unique constraint; the loser surfaces the error to the queue, which
  // routes to retry/fail per shouldAutoRetry.
  const reportNotes = backend.from(
    "report_notes" as unknown as "file_metadata",
  ) as unknown as ReportNotesTable;

  const { data: maxRow, error: maxErr } = await reportNotes
    .select("position")
    .eq("report_id", args.reportId)
    .is("deleted_at", null)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (maxErr) throw new Error(maxErr.message);

  const nextPosition =
    ((maxRow?.position as number | undefined) ?? 0) + 1;

  const { error: insertErr } = await reportNotes.insert({
    report_id: args.reportId,
    project_id: args.projectId,
    author_id: args.authorId,
    position: nextPosition,
    kind: args.kind,
    body: null,
    file_id: args.fileId,
  });
  if (insertErr) throw new Error(insertErr.message);
}

/**
 * Minimal duck-typed shape of the report_notes PostgREST builder we
 * need. Kept local to avoid widening BackendLike just for the queue.
 */
interface ReportNotesTable {
  select: (cols: string) => ReportNotesTable;
  eq: (col: string, val: unknown) => ReportNotesTable;
  is: (col: string, val: null) => ReportNotesTable;
  order: (col: string, opts: { ascending: boolean }) => ReportNotesTable;
  limit: (n: number) => ReportNotesTable;
  maybeSingle: () => PromiseLike<{
    data: { position?: number } | null;
    error: { message: string } | null;
  }>;
  insert: (row: Record<string, unknown>) => PromiseLike<{
    error: { message: string } | null;
  }>;
}

// Re-export for tests.
export type { UriToBlobDeps };
