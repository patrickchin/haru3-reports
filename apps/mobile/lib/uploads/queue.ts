/**
 * Upload queue runtime.
 *
 * In-memory `Map<jobId, UploadJob>` driven by the pure reducer in
 * `jobs.ts`. Persists a snapshot to AsyncStorage so failed jobs can be
 * resumed after app restart. Single-flight worker loop — at most one
 * upload runs at a time so we don't fight for CPU/bandwidth with the
 * UI thread.
 *
 * For unit tests construct one with `createUploadQueue({...})` and
 * inject every dep. In app code import `getUploadQueue()`, which lazily
 * builds a singleton wired to the real Supabase client + AsyncStorage +
 * expo-file-system.
 */
import {
  backoffMs,
  createJob,
  fromPersisted,
  isTerminal,
  reduce,
  shouldAutoRetry,
  toPersisted,
  type EnqueueInput,
  type JobEvent,
  type PersistedJob,
  type UploadJob,
  type UploadJobState,
} from "./jobs";
import { runUploadJob, type UploaderDeps, type UploaderResult } from "./uploader";
import type { UploadForegroundService } from "./android-foreground-service";

// ----- Public API -----------------------------------------------------------

export interface UploadQueueDeps {
  /** AsyncStorage shape; tests pass an in-memory map. */
  storage: StorageLike;
  /** Returns true if the URI still resolves to readable bytes. */
  fileExists: (uri: string) => Promise<boolean>;
  /** UploaderDeps consumed by `runUploadJob`. */
  uploader: UploaderDeps;
  now?: () => number;
  uuid?: () => string;
  /** Test seam — defaults to `globalThis.setTimeout`. */
  schedule?: (fn: () => void, ms: number) => unknown;
  /** Persist debounce window in ms (0 in tests for determinism). */
  persistDebounceMs?: number;
  /** Optional hook fired exactly once per terminal transition. */
  onJobChanged?: (job: UploadJob) => void;
  /**
   * Android foreground-service controller. When provided, the queue
   * calls `notifyActive` while jobs are pending/in-flight and `stop`
   * when it settles to idle. iOS / tests omit it.
   */
  foregroundService?: UploadForegroundService;
}

export interface StorageLike {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
}

export interface UploadQueue {
  /** Subscribe to all state changes. Returns an unsubscribe fn. */
  subscribe: (listener: () => void) => () => void;
  /** Snapshot of current jobs (insertion order). */
  getJobs: () => UploadJob[];
  /** Snapshot a single job. */
  getJob: (jobId: string) => UploadJob | undefined;
  /** Enqueue an upload. Returns the new jobId. Triggers a tick. */
  enqueueUpload: (input: EnqueueInput) => string;
  /** Cancel a pending or in-flight job. No-op if terminal. */
  cancelUpload: (jobId: string) => void;
  /** Move a failed job back to pending and trigger a tick. */
  retryUpload: (jobId: string) => void;
  /** Replace internal state from AsyncStorage. Awaitable, idempotent. */
  hydrate: () => Promise<void>;
  /**
   * Wait for the worker loop to settle (no pending jobs running).
   * Test-only convenience; resolves immediately if idle.
   */
  whenIdle: () => Promise<void>;
}

export const QUEUE_STORAGE_KEY = "harpa.uploads.queue.v1";

// ----- Implementation -------------------------------------------------------

interface InternalDeps {
  storage: StorageLike;
  fileExists: (uri: string) => Promise<boolean>;
  uploader: UploaderDeps;
  now: () => number;
  uuid: () => string;
  schedule: (fn: () => void, ms: number) => unknown;
  persistDebounceMs: number;
  onJobChanged?: (job: UploadJob) => void;
  foregroundService?: UploadForegroundService;
}

export function createUploadQueue(deps: UploadQueueDeps): UploadQueue {
  const internal: InternalDeps = {
    storage: deps.storage,
    fileExists: deps.fileExists,
    uploader: deps.uploader,
    now: deps.now ?? (() => Date.now()),
    uuid: deps.uuid ?? defaultUuid,
    schedule:
      deps.schedule ??
      ((fn, ms) => globalThis.setTimeout(fn, ms) as unknown as number),
    persistDebounceMs: deps.persistDebounceMs ?? 200,
    onJobChanged: deps.onJobChanged,
    foregroundService: deps.foregroundService,
  };

  // Insertion-ordered Map of all known jobs.
  const jobs = new Map<string, UploadJob>();
  const listeners = new Set<() => void>();
  let runningJobId: string | null = null;
  let idleResolvers: Array<() => void> = [];
  let persistHandle: unknown = null;
  let hydrated = false;

  // ----- internal helpers -----

  const emit = () => {
    for (const fn of listeners) {
      try {
        fn();
      } catch {
        // listeners must not throw across the boundary; swallow to keep
        // other listeners alive (matches React's useSyncExternalStore).
      }
    }
  };

  const apply = (jobId: string, event: JobEvent): UploadJob | undefined => {
    const current = jobs.get(jobId);
    if (!current) return undefined;
    const next = reduce(current, event, internal.now());
    jobs.set(jobId, next);
    if (next.state !== current.state || next.progress !== current.progress) {
      emit();
      schedulePersist();
      if (next.state !== current.state) internal.onJobChanged?.(next);
      // Keep the foreground-service notification in sync. Only fire
      // when there's still work to do; settleIdle handles tear-down.
      const active = countActive();
      if (active > 0) {
        void internal.foregroundService?.notifyActive({
          active,
          progress: aggregateProgress(),
        });
      }
    }
    return next;
  };

  const schedulePersist = () => {
    if (persistHandle != null) return;
    persistHandle = internal.schedule(() => {
      persistHandle = null;
      void persistNow();
    }, internal.persistDebounceMs);
  };

  const persistNow = async (): Promise<void> => {
    const snapshot: PersistedJob[] = [];
    for (const job of jobs.values()) {
      // Cancelled and uploaded jobs aren't worth persisting — they
      // can't be resumed and only bloat the storage payload.
      if (job.state === "cancelled" || job.state === "uploaded") continue;
      snapshot.push(toPersisted(job));
    }
    try {
      if (snapshot.length === 0) {
        await internal.storage.removeItem(QUEUE_STORAGE_KEY);
      } else {
        await internal.storage.setItem(
          QUEUE_STORAGE_KEY,
          JSON.stringify(snapshot),
        );
      }
    } catch {
      // Persistence is best-effort; the in-memory state is still correct.
    }
  };

  const settleIdle = () => {
    if (runningJobId != null) return;
    if (pickNextPending() != null) return;
    void internal.foregroundService?.stop();
    const resolvers = idleResolvers;
    idleResolvers = [];
    for (const r of resolvers) r();
  };

  const pickNextPending = (): UploadJob | undefined => {
    for (const job of jobs.values()) {
      if (job.state === "pending") return job;
    }
    return undefined;
  };

  /** Count jobs the foreground service should keep alive for. */
  const countActive = (): number => {
    let n = 0;
    for (const job of jobs.values()) {
      if (
        job.state === "pending" ||
        job.state === "preprocessing" ||
        job.state === "uploading"
      ) {
        n += 1;
      }
    }
    return n;
  };

  /** Average progress across in-flight jobs (undefined if none). */
  const aggregateProgress = (): number | undefined => {
    let sum = 0;
    let count = 0;
    for (const job of jobs.values()) {
      if (job.state === "uploading" || job.state === "preprocessing") {
        sum += job.progress ?? 0;
        count += 1;
      }
    }
    return count > 0 ? sum / count : undefined;
  };

  // ----- worker loop -----

  const tick = (): void => {
    if (runningJobId != null) return; // single-flight
    const next = pickNextPending();
    if (!next) {
      settleIdle();
      return;
    }
    runningJobId = next.id;
    void runOne(next.id).finally(() => {
      runningJobId = null;
      // Yield to the microtask queue so listeners observe the terminal
      // state before the next job kicks off.
      Promise.resolve().then(tick);
    });
  };

  const runOne = async (jobId: string): Promise<void> => {
    apply(jobId, { type: "start-preprocess" });

    try {
      const result: UploaderResult = await runUploadJob(
        jobs.get(jobId)!.input,
        internal.uploader,
        {
          onPreprocessComplete: (info) => {
            apply(jobId, { type: "preprocess-complete", ...info });
            // start-upload is intentionally a separate event so the UI
            // can show a "Uploading…" label distinct from "Resizing…".
          },
          onUploadStart: () => {
            apply(jobId, { type: "start-upload" });
          },
          onProgress: (fraction) => {
            apply(jobId, { type: "progress", progress: fraction });
          },
        },
      );

      // If the job was cancelled mid-flight, roll back the freshly
      // uploaded bytes + metadata so we don't leave orphans.
      const post = jobs.get(jobId);
      if (post?.state === "cancelled") {
        await internal.uploader
          .deleteProjectFile(
            internal.uploader.backend,
            result.metadataRow.id,
            result.storagePath,
            result.metadataRow.thumbnail_path ?? null,
          )
          .catch(() => {
            // best-effort; orphan-cleanup job will sweep stragglers.
          });
        return;
      }

      apply(jobId, {
        type: "upload-complete",
        fileId: result.metadataRow.id,
        storagePath: result.storagePath,
        metadataRow: result.metadataRow,
      });
    } catch (err) {
      const post = jobs.get(jobId);
      if (post?.state === "cancelled") return; // user got there first
      const message = err instanceof Error ? err.message : String(err);
      apply(jobId, { type: "fail", error: message });

      const updated = jobs.get(jobId)!;
      if (shouldAutoRetry(err, updated.attempts)) {
        const ms = backoffMs(updated.attempts);
        internal.schedule(() => {
          // Only retry if still failed (user may have cancelled).
          const cur = jobs.get(jobId);
          if (cur?.state === "failed") {
            apply(jobId, { type: "retry" });
            tick();
          }
        }, ms);
      }
    }
  };

  // ----- public methods -----

  const enqueueUpload = (input: EnqueueInput): string => {
    const id = internal.uuid();
    jobs.set(id, createJob(id, input, internal.now()));
    emit();
    schedulePersist();
    void internal.foregroundService?.notifyActive({
      active: countActive(),
      progress: aggregateProgress(),
    });
    tick();
    return id;
  };

  const cancelUpload = (jobId: string): void => {
    const cur = jobs.get(jobId);
    if (!cur || isTerminal(cur.state)) return;
    // Failed jobs are also cancellable — the user clicking "remove"
    // should clear the entry, not leave it dangling.
    apply(jobId, { type: "cancel" });
  };

  const retryUpload = (jobId: string): void => {
    const cur = jobs.get(jobId);
    if (!cur || cur.state !== "failed") return;
    apply(jobId, { type: "retry" });
    tick();
  };

  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  const getJobs = (): UploadJob[] => Array.from(jobs.values());

  const getJob = (jobId: string): UploadJob | undefined => jobs.get(jobId);

  const hydrate = async (): Promise<void> => {
    if (hydrated) return;
    hydrated = true;
    let raw: string | null = null;
    try {
      raw = await internal.storage.getItem(QUEUE_STORAGE_KEY);
    } catch {
      return;
    }
    if (!raw) return;
    let parsed: PersistedJob[] = [];
    try {
      const data = JSON.parse(raw);
      if (Array.isArray(data)) parsed = data as PersistedJob[];
    } catch {
      // Corrupt blob — drop it on the floor.
      await internal.storage.removeItem(QUEUE_STORAGE_KEY).catch(() => {});
      return;
    }

    for (const p of parsed) {
      const job = fromPersisted(p);
      // Ghost detection — if the source URI no longer resolves (user
      // cleared cache, photo was removed, etc.) mark the job failed so
      // the UI can show a "missing file" affordance.
      const exists = await internal.fileExists(job.input.sourceUri).catch(
        () => false,
      );
      if (!exists) {
        jobs.set(job.id, {
          ...job,
          state: "failed" as UploadJobState,
          lastError: "source file no longer exists",
          updatedAt: internal.now(),
        });
        continue;
      }
      jobs.set(job.id, job);
    }
    emit();
    tick();
  };

  const whenIdle = (): Promise<void> => {
    if (runningJobId == null && pickNextPending() == null) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      idleResolvers.push(resolve);
    });
  };

  return {
    subscribe,
    getJobs,
    getJob,
    enqueueUpload,
    cancelUpload,
    retryUpload,
    hydrate,
    whenIdle,
  };
}

// ----- Singleton (production wire-up) ---------------------------------------

let _singleton: UploadQueue | null = null;

/**
 * Lazy app-wide singleton. Tests should call `createUploadQueue` with
 * their own deps instead — and use `__resetUploadQueueForTests()` to
 * scrub state if they import the singleton transitively.
 */
export function getUploadQueue(): UploadQueue {
  if (_singleton) return _singleton;
  _singleton = buildDefaultQueue();
  return _singleton;
}

export function __resetUploadQueueForTests(): void {
  _singleton = null;
}

function buildDefaultQueue(): UploadQueue {
  // Lazy-require RN-only modules so unit tests can import this file
  // without dragging in expo-file-system / AsyncStorage.
  // Wire-up happens at first call from app code.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const AsyncStorage = require("@react-native-async-storage/async-storage")
    .default as StorageLike;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const FileSystem = require("expo-file-system");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const FileSystemLegacy = require("expo-file-system/legacy");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Platform } = require("react-native") as { Platform: { OS: string } };
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { backend } = require("@/lib/backend") as {
    backend: UploaderDeps["backend"];
  };
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { uriToBlob } = require("./blob") as {
    uriToBlob: UploaderDeps["uriToBlob"];
  };
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fileUploadMod = require("@/lib/file-upload") as {
    uploadProjectFile: UploaderDeps["uploadProjectFile"];
    deleteProjectFile: UploaderDeps["deleteProjectFile"];
  };
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const preprocessMod = require("@/lib/preprocess-image") as {
    preprocessImageForUpload: import("./preprocess-step").PreprocessDeps["preprocess"];
  };
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const iosBgMod = require("./ios-background-upload") as {
    uploadProjectFileViaBackground: UploaderDeps["uploadProjectFileViaBackground"];
  };
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fgServiceMod = require("./android-foreground-service") as {
    createUploadForegroundService: typeof import("./android-foreground-service").createUploadForegroundService;
    registerUploadForegroundTask: typeof import("./android-foreground-service").registerUploadForegroundTask;
  };

  // Android-only: register the headless task NOW (before any
  // foreground intent fires) and build a live service controller. iOS
  // gets a no-op stub so the queue can call it unconditionally.
  let foregroundService: UploadForegroundService | undefined;
  if (Platform.OS === "android") {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const notifee = require("@notifee/react-native").default as
        | import("./android-foreground-service").NotifeeLike
        | undefined;
      if (notifee) {
        fgServiceMod.registerUploadForegroundTask(notifee);
        foregroundService = fgServiceMod.createUploadForegroundService({
          notifee,
          platform: "android",
        });
      }
    } catch {
      // notifee not available (unlikely in production but possible if
      // dev-client lags behind a JS update). Fall back to no service —
      // uploads still run while app is foreground.
    }
  }

  const fileExists = async (uri: string): Promise<boolean> => {
    try {
      const info = await FileSystem.getInfoAsync(uri);
      return Boolean(info?.exists);
    } catch {
      return false;
    }
  };

  // iOS: PUT bytes via NSURLSession so the OS finishes uploads after
  // the JS runtime is suspended. Resolves on 2xx; throws otherwise.
  const uploadViaBackgroundSession =
    Platform.OS === "ios"
      ? async (args: {
          signedUrl: string;
          fileUri: string;
          mimeType: string;
          onProgress?: (fraction: number) => void;
        }): Promise<void> => {
          const task = FileSystemLegacy.createUploadTask(
            args.signedUrl,
            args.fileUri,
            {
              httpMethod: "PUT",
              uploadType: FileSystemLegacy.FileSystemUploadType.BINARY_CONTENT,
              sessionType: FileSystemLegacy.FileSystemSessionType.BACKGROUND,
              mimeType: args.mimeType,
              headers: { "content-type": args.mimeType },
            },
            args.onProgress
              ? (progress: {
                  totalBytesSent: number;
                  totalBytesExpectedToSend: number;
                }) => {
                  if (progress.totalBytesExpectedToSend > 0) {
                    args.onProgress!(
                      progress.totalBytesSent /
                        progress.totalBytesExpectedToSend,
                    );
                  }
                }
              : undefined,
          );
          const result = await task.uploadAsync();
          if (!result || result.status < 200 || result.status >= 300) {
            throw new Error(
              `HTTP ${result?.status ?? "unknown"}: ${result?.body ?? ""}`.slice(0, 500),
            );
          }
        }
      : undefined;

  return createUploadQueue({
    storage: AsyncStorage,
    fileExists,
    uploader: {
      backend,
      uriToBlob,
      preprocess: { preprocess: preprocessMod.preprocessImageForUpload },
      uploadProjectFile: fileUploadMod.uploadProjectFile,
      deleteProjectFile: fileUploadMod.deleteProjectFile,
      uploadProjectFileViaBackground: uploadViaBackgroundSession
        ? iosBgMod.uploadProjectFileViaBackground
        : undefined,
      uploadViaBackgroundSession,
    },
    foregroundService,
  });
}

// ----- Internal -------------------------------------------------------------

function defaultUuid(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
}
