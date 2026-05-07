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
  uploadProjectFile,
  type BackendLike,
  type FileMetadataRow,
} from "@/lib/file-upload";
import { uriToBlob, type UriToBlobDeps } from "@/lib/uploads/blob";
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
): Promise<UploaderResult> {
  // 1. Preprocess (image only)
  const pre = await runPreprocessStep(input, deps.preprocess);
  handlers.onPreprocessComplete(pre);

  const useBackground = Boolean(
    deps.uploadProjectFileViaBackground && deps.uploadViaBackgroundSession,
  );

  // 2. Read working URI as Blob — only needed for the foreground path.
  // The background path hands the fileUri straight to NSURLSession.
  let bodyBlob: Blob | null = null;
  if (!useBackground) {
    const out = await deps.uriToBlob(pre.workingUri);
    bodyBlob = out.blob as Blob;
  }

  // 2b. Optional thumbnail blob (always foreground — bytes are tiny).
  let thumbnail: Parameters<typeof deps.uploadProjectFile>[0]["thumbnail"] = null;
  if (pre.thumbnailUri) {
    const { blob: thumbBlob } = await deps.uriToBlob(pre.thumbnailUri);
    thumbnail = {
      body: thumbBlob,
      mimeType: "image/jpeg",
      sizeBytes: thumbBlob.size,
    };
  }

  // 3. Upload + insert file_metadata.
  handlers.onUploadStart();

  if (input.kind === "avatar") {
    // Avatar uploads aren't part of the project-files queue path. The
    // queue could be extended for avatars later; for now reject so we
    // don't silently mis-route a job into the wrong bucket.
    throw new Error("upload-queue: avatar kind is handled separately");
  }

  if (!input.projectId) {
    throw new Error("upload-queue: project upload missing projectId");
  }

  const sizeBytes = bodyBlob?.size ?? input.sizeBytes;

  const { metadata, storagePath } = useBackground
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

  // 4. Optionally link a report_notes row (image / document / attachment).
  // We bail out of the entire upload if linking fails — preserves the
  // back-compat invariant that "row in DB ⇒ note exists for the report".
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
