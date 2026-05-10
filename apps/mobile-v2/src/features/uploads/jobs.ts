/**
 * Pure types and state-machine reducer for the upload queue.
 *
 * VERBATIM PORT from apps/mobile/lib/uploads/jobs.ts with minimal
 * adaptations for v2 types. No React, no I/O, no async — everything
 * here is synchronous and deterministic so it can be unit-tested
 * without mocks. The runtime lives in `queue.ts`; the actual byte
 * transfer in `uploader.ts`.
 *
 * State machine:
 *
 *   pending ──► preprocessing ──► uploading ──► uploaded
 *      ▲             │                │             │
 *      │             ▼                ▼             │
 *      │          failed ◄───────  failed           │
 *      │             │                              │
 *      └───── retry ─┘                              │
 *                                                   │
 *                                  cancelled ◄──────┘ (only while pending/
 *                                                      preprocessing/uploading)
 *
 * `uploaded` and `cancelled` are terminal. `failed` is terminal-until-retry.
 */
import type { FileMetadata } from "@/infra/db-types";

export type UploadKind = "photo" | "document" | "voice" | "avatar";

export type UploadJobState =
  | "pending"
  | "preprocessing"
  | "uploading"
  | "uploaded"
  | "failed"
  | "cancelled";

/**
 * Caller-supplied description of an upload. The queue persists this
 * verbatim so a failed job can be resurrected after app restart.
 *
 * Keep it serialisable — no functions, no Blobs, no Dates (use ms epoch).
 */
export interface EnqueueInput {
  kind: UploadKind;
  /** file:// or content:// or ph:// — passed to uriToBlob. */
  sourceUri: string;
  /** Display filename written to file_metadata.filename. */
  filename: string;
  mimeType: string;
  /** Best-effort size from the picker; preprocess may shrink it. */
  sizeBytes: number;
  /** Required for photo / document / voice. */
  projectId?: string;
  /** When set, a photo/document/attachment job links a report_notes row on success. */
  reportId?: string | null;
  /** Auth user id; written to file_metadata.uploaded_by. */
  uploadedBy: string;
  /** Pre-generated file ID to use (optional, will be generated if not provided). */
  fileId?: string;
  /** Image-only metadata hints (when known by the caller). */
  width?: number;
  height?: number;
  /** Voice-note duration. */
  durationMs?: number;
  /** When true, run the image preprocess step (resize + thumbnail + blurhash). */
  isImage: boolean;
}

/** Snapshot of a single in-flight or completed upload. */
export interface UploadJob {
  id: string;
  state: UploadJobState;
  attempts: number;
  lastError?: string;
  /** 0..1 byte progress; only meaningful while state === 'uploading'. */
  progress: number;
  /** Set by preprocess step. For non-image jobs, equals input.sourceUri. */
  workingUri?: string;
  thumbnailUri?: string;
  width?: number;
  height?: number;
  blurhash?: string | null;
  /** Hydrated on success. */
  fileId?: string;
  storagePath?: string;
  metadataRow?: FileMetadata;
  /**
   * R11 optimistic-placeholder bookkeeping. Set once when the
   * uploader inserts the `pending` row, then reused across retries so
   * a transient failure doesn't spawn duplicate `failed` rows in
   * `file_metadata`. Cleared by the queue when the job is cancelled.
   */
  placeholderFileId?: string;
  placeholderStoragePath?: string;
  createdAt: number;
  updatedAt: number;
  input: EnqueueInput;
}

/** Subset persisted to AsyncStorage (drops transient progress). */
export interface PersistedJob {
  id: string;
  state: UploadJobState;
  attempts: number;
  lastError?: string;
  workingUri?: string;
  thumbnailUri?: string;
  width?: number;
  height?: number;
  blurhash?: string | null;
  fileId?: string;
  storagePath?: string;
  placeholderFileId?: string;
  placeholderStoragePath?: string;
  createdAt: number;
  updatedAt: number;
  input: EnqueueInput;
}

// ---------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------

export type JobEvent =
  | { type: "start-preprocess" }
  | {
      type: "placeholder-inserted";
      placeholderFileId: string;
      placeholderStoragePath: string;
    }
  | {
      type: "preprocess-complete";
      workingUri: string;
      thumbnailUri?: string;
      width?: number;
      height?: number;
      blurhash?: string | null;
    }
  | { type: "start-upload" }
  | { type: "progress"; progress: number }
  | {
      type: "upload-complete";
      fileId: string;
      storagePath: string;
      metadataRow: FileMetadata;
    }
  | { type: "fail"; error: string }
  | { type: "retry" }
  | { type: "cancel" };

const TERMINAL: ReadonlySet<UploadJobState> = new Set([
  "uploaded",
  "cancelled",
]);

/** True if no further state changes are possible without a retry. */
export function isTerminal(state: UploadJobState): boolean {
  return TERMINAL.has(state);
}

/**
 * Pure reducer. Throws on illegal transitions so bugs surface in tests
 * rather than as silent state corruption.
 */
export function reduce(
  job: UploadJob,
  event: JobEvent,
  now: number,
): UploadJob {
  const next = (patch: Partial<UploadJob>): UploadJob => ({
    ...job,
    ...patch,
    updatedAt: now,
  });

  switch (event.type) {
    case "start-preprocess":
      assertFrom(job.state, ["pending"], event.type);
      return next({ state: "preprocessing", lastError: undefined });

    case "placeholder-inserted":
      // Idempotent — only record if not already set. Allowed in any
      // pre-terminal state because the insert may race with progress.
      if (job.placeholderFileId) return job;
      return next({
        placeholderFileId: event.placeholderFileId,
        placeholderStoragePath: event.placeholderStoragePath,
      });

    case "preprocess-complete":
      assertFrom(job.state, ["preprocessing"], event.type);
      return next({
        workingUri: event.workingUri,
        thumbnailUri: event.thumbnailUri,
        width: event.width,
        height: event.height,
        blurhash: event.blurhash,
      });

    case "start-upload":
      assertFrom(job.state, ["preprocessing", "pending"], event.type);
      return next({ state: "uploading", progress: 0, lastError: undefined });

    case "progress":
      // Progress events outside 'uploading' are dropped silently — they
      // can race a cancel/fail and we don't want them to throw.
      if (job.state !== "uploading") return job;
      return next({ progress: clamp01(event.progress) });

    case "upload-complete":
      assertFrom(job.state, ["uploading"], event.type);
      return next({
        state: "uploaded",
        progress: 1,
        fileId: event.fileId,
        storagePath: event.storagePath,
        metadataRow: event.metadataRow,
      });

    case "fail":
      // 4xx/5xx routing happens in the runtime; the reducer just records.
      assertFrom(
        job.state,
        ["pending", "preprocessing", "uploading"],
        event.type,
      );
      return next({
        state: "failed",
        attempts: job.attempts + 1,
        lastError: event.error,
      });

    case "retry":
      assertFrom(job.state, ["failed"], event.type);
      return next({ state: "pending", lastError: undefined, progress: 0 });

    case "cancel":
      if (TERMINAL.has(job.state)) return job;
      return next({ state: "cancelled", progress: 0 });

    default: {
      const _exhaustive: never = event;
      throw new Error(`unknown job event: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

function assertFrom(
  state: UploadJobState,
  allowed: UploadJobState[],
  evt: string,
): void {
  if (!allowed.includes(state)) {
    throw new Error(
      `upload-queue: illegal transition '${evt}' from state '${state}'; expected one of ${allowed.join(", ")}`,
    );
  }
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------

export function createJob(
  id: string,
  input: EnqueueInput,
  now: number,
): UploadJob {
  return {
    id,
    state: "pending",
    attempts: 0,
    progress: 0,
    createdAt: now,
    updatedAt: now,
    input,
  };
}

export function toPersisted(job: UploadJob): PersistedJob {
  return {
    id: job.id,
    state: job.state,
    attempts: job.attempts,
    lastError: job.lastError,
    workingUri: job.workingUri,
    thumbnailUri: job.thumbnailUri,
    width: job.width,
    height: job.height,
    blurhash: job.blurhash,
    fileId: job.fileId,
    storagePath: job.storagePath,
    placeholderFileId: job.placeholderFileId,
    placeholderStoragePath: job.placeholderStoragePath,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    input: job.input,
  };
}

export function fromPersisted(p: PersistedJob): UploadJob {
  return {
    ...p,
    progress: 0,
  };
}

/**
 * True if the error warrants an automatic retry. 5xx / network errors
 * are transient; 4xx are not.
 */
export function shouldAutoRetry(error: string): boolean {
  const e = error.toLowerCase();
  return (
    e.includes("network") ||
    e.includes("timeout") ||
    e.includes("503") ||
    e.includes("502") ||
    e.includes("500")
  );
}

/**
 * Exponential backoff with jitter for failed jobs.
 * attempt 1 → ~2s, attempt 2 → ~4s, attempt 3 → ~8s, cap at 30s.
 */
export function backoffMs(attempt: number): number {
  const base = Math.min(30_000, 1000 * Math.pow(2, attempt));
  // justified-deviation: jitter, not an identifier
  return base + Math.random() * 1000;
}
