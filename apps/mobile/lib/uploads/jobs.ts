/**
 * Pure types and state-machine reducer for the upload queue.
 *
 * No React, no I/O, no async — everything here is synchronous and
 * deterministic so it can be unit-tested without mocks. The runtime
 * lives in `queue.ts`; the actual byte transfer in `uploader.ts`.
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
import type { FileMetadataRow } from "@/lib/file-upload";

export type UploadKind = "project-image" | "avatar" | "document" | "voice-note";

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
  /** ph:// or file:// or content:// — passed to uriToBlob. */
  sourceUri: string;
  /** Display filename written to file_metadata.filename. */
  filename: string;
  mimeType: string;
  /** Best-effort size from the picker; preprocess may shrink it. */
  sizeBytes: number;
  /** Required for project-image / document / voice-note. */
  projectId?: string;
  /** When set, an image/document/attachment job links a report_notes row on success. */
  reportId?: string | null;
  /** Auth user id; written to file_metadata.uploaded_by. */
  uploadedBy: string;
  /** Image-only metadata hints (when known by the caller). */
  width?: number;
  height?: number;
  /** Voice-note duration. */
  durationMs?: number;
  /** category written to file_metadata.category. */
  category: "image" | "document" | "voice-note" | "attachment" | "icon";
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
  metadataRow?: FileMetadataRow;
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
      metadataRow: FileMetadataRow;
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
export function reduce(job: UploadJob, event: JobEvent, now: number): UploadJob {
  const next = (patch: Partial<UploadJob>): UploadJob => ({
    ...job,
    ...patch,
    updatedAt: now,
  });

  switch (event.type) {
    case "start-preprocess":
      assertFrom(job.state, ["pending"], event.type);
      return next({ state: "preprocessing", lastError: undefined });

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

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

// ---------------------------------------------------------------
// Retry policy
// ---------------------------------------------------------------

/** Retry budget per job. After this, the job stays 'failed' until manual retry. */
export const MAX_AUTO_ATTEMPTS = 5;

/**
 * Exponential backoff, capped at 60 s. attempts=1 => 1 s, 2 => 2 s, …, 6 => 32 s, 7+ => 60 s.
 * Returns ms.
 */
export function backoffMs(attempts: number): number {
  if (attempts <= 0) return 0;
  const ms = Math.pow(2, attempts - 1) * 1000;
  return Math.min(ms, 60_000);
}

/**
 * Classify an error to decide whether the queue should auto-retry. 4xx auth
 * / validation errors are terminal (no retry); 5xx, network, timeout retry.
 */
export function shouldAutoRetry(error: unknown, attempts: number): boolean {
  if (attempts >= MAX_AUTO_ATTEMPTS) return false;
  const msg = errorString(error).toLowerCase();
  // Heuristic — Supabase storage client surfaces messages like "Bad Request"
  // / "Unauthorized" / "Forbidden" / "Not Found" for client-side problems.
  if (
    msg.includes("unauthorized") ||
    msg.includes("forbidden") ||
    msg.includes("not found") ||
    msg.includes("invalid") ||
    msg.includes("payload too large") ||
    msg.includes("conflict")
  ) {
    return false;
  }
  return true;
}

function errorString(error: unknown): string {
  if (error == null) return "";
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

// ---------------------------------------------------------------
// Persistence helpers
// ---------------------------------------------------------------

/** Serialise a job for AsyncStorage. Drops live progress; metadataRow is dropped because it lives in the DB now. */
export function toPersisted(job: UploadJob): PersistedJob {
  const {
    id,
    state,
    attempts,
    lastError,
    workingUri,
    thumbnailUri,
    width,
    height,
    blurhash,
    fileId,
    storagePath,
    createdAt,
    updatedAt,
    input,
  } = job;
  return {
    id,
    state,
    attempts,
    lastError,
    workingUri,
    thumbnailUri,
    width,
    height,
    blurhash,
    fileId,
    storagePath,
    createdAt,
    updatedAt,
    input,
  };
}

/** Hydrate a persisted record. In-flight states snap back to 'pending' on app restart. */
export function fromPersisted(p: PersistedJob): UploadJob {
  const inFlight =
    p.state === "preprocessing" || p.state === "uploading";
  return {
    id: p.id,
    state: inFlight ? "pending" : p.state,
    attempts: p.attempts,
    lastError: p.lastError,
    progress: 0,
    workingUri: p.workingUri,
    thumbnailUri: p.thumbnailUri,
    width: p.width,
    height: p.height,
    blurhash: p.blurhash,
    fileId: p.fileId,
    storagePath: p.storagePath,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    input: p.input,
  };
}

/** Factory for a freshly enqueued job. */
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
