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
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
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
} from "./jobs";
import {
  runUploadJob,
  type UploaderDeps,
  type UploaderResult,
} from "./uploader";

// ----- Public API -----------------------------------------------------------

export interface UploadQueueDeps {
  /** AsyncStorage shape; tests pass an in-memory map. */
  storage: StorageLike;
  /** UploaderDeps consumed by `runUploadJob`. */
  uploader: UploaderDeps;
  now?: () => number;
  uuid: () => string;
  /** Test seam — defaults to `globalThis.setTimeout`. */
  schedule?: (fn: () => void, ms: number) => unknown;
  /** Persist debounce window in ms (0 in tests for determinism). */
  persistDebounceMs?: number;
  /** Optional hook fired exactly once per terminal transition. */
  onJobChanged?: (job: UploadJob) => void;
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

/**
 * Failed jobs older than this on hydrate are dropped, not restored.
 *
 * A failed upload from a previous app session is rarely actionable as
 * an in-flight timeline card — the user has moved on, the source URI
 * may no longer resolve, and rendering 100s of them on every screen
 * mount kills first-paint perf.
 */
export const MAX_FAILED_JOB_AGE_MS = 24 * 60 * 60 * 1000;

// ----- Implementation -------------------------------------------------------

interface InternalDeps {
  storage: StorageLike;
  uploader: UploaderDeps;
  now: () => number;
  uuid: () => string;
  schedule: (fn: () => void, ms: number) => unknown;
  persistDebounceMs: number;
  onJobChanged?: (job: UploadJob) => void;
}

export function createUploadQueue(deps: UploadQueueDeps): UploadQueue {
  const internal: InternalDeps = {
    storage: deps.storage,
    uploader: deps.uploader,
    now: deps.now ?? (() => Date.now()),
    uuid: deps.uuid,
    schedule:
      deps.schedule ??
      ((fn, ms) => globalThis.setTimeout(fn, ms) as unknown as number),
    persistDebounceMs: deps.persistDebounceMs ?? 200,
    onJobChanged: deps.onJobChanged,
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

  // ----- worker loop -----

  const tick = (): void => {
    if (runningJobId != null) return; // single-flight
    const next = pickNextPending();
    if (!next) {
      settleIdle();
      return;
    }
    runningJobId = next.id;
    void runJob(next.id);
  };

  const runJob = async (jobId: string): Promise<void> => {
    const job = jobs.get(jobId);
    if (!job) {
      runningJobId = null;
      tick();
      return;
    }

    try {
      const result = await runUploadJob(
        job.input,
        internal.uploader,
        {
          onPreprocessComplete: (info) => {
            apply(jobId, {
              type: "preprocess-complete",
              workingUri: info.workingUri,
              thumbnailUri: info.thumbnailUri,
              width: info.width,
              height: info.height,
              blurhash: info.blurhash,
            });
          },
          onUploadStart: () => {
            apply(jobId, { type: "start-upload" });
          },
          onProgress: (fraction) => {
            apply(jobId, { type: "progress", progress: fraction });
          },
          onPlaceholderInserted: (info) => {
            apply(jobId, {
              type: "placeholder-inserted",
              placeholderFileId: info.placeholderFileId,
              placeholderStoragePath: info.placeholderStoragePath,
            });
          },
        },
        {
          existingPlaceholder: job.placeholderFileId
            ? {
                fileId: job.placeholderFileId,
                storagePath: job.placeholderStoragePath!,
              }
            : undefined,
        },
      );

      apply(jobId, {
        type: "upload-complete",
        fileId: result.metadataRow.id,
        storagePath: result.storagePath,
        metadataRow: result.metadataRow,
      });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      apply(jobId, { type: "fail", error: errMsg });

      // Auto-retry transient errors once.
      const updated = jobs.get(jobId);
      if (updated && updated.attempts === 1 && shouldAutoRetry(errMsg)) {
        internal.schedule(() => {
          apply(jobId, { type: "retry" });
          tick();
        }, backoffMs(updated.attempts));
      }
    } finally {
      runningJobId = null;
      tick();
    }
  };

  // ----- Public API -----

  const enqueueUpload = (input: EnqueueInput): string => {
    const id = internal.uuid();
    const job = createJob(id, input, internal.now());
    jobs.set(id, job);
    emit();
    schedulePersist();
    tick();
    return id;
  };

  const cancelUpload = (jobId: string): void => {
    apply(jobId, { type: "cancel" });
  };

  const retryUpload = (jobId: string): void => {
    apply(jobId, { type: "retry" });
    tick();
  };

  const hydrate = async (): Promise<void> => {
    if (hydrated) return;
    hydrated = true;
    try {
      const raw = await internal.storage.getItem(QUEUE_STORAGE_KEY);
      if (!raw) return;
      const snapshot = JSON.parse(raw) as PersistedJob[];
      const cutoff = internal.now() - MAX_FAILED_JOB_AGE_MS;
      for (const p of snapshot) {
        // Drop ancient failed jobs (see MAX_FAILED_JOB_AGE_MS).
        if (p.state === "failed" && p.updatedAt < cutoff) continue;
        jobs.set(p.id, fromPersisted(p));
      }
      emit();
      tick();
    } catch {
      // Swallow hydration errors — start fresh if the snapshot is corrupt.
    }
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
    subscribe: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    getJobs: () => Array.from(jobs.values()),
    getJob: (id) => jobs.get(id),
    enqueueUpload,
    cancelUpload,
    retryUpload,
    hydrate,
    whenIdle,
  };
}

// ----- Singleton ------------------------------------------------------------

let singleton: UploadQueue | null = null;

/**
 * Lazily builds the production upload queue wired to real deps.
 * Tests should NOT use this — they should construct their own via
 * `createUploadQueue` with mocks.
 */
export function getUploadQueue(): UploadQueue {
  if (!singleton) {
    // Import uploader deps here to avoid circular deps at module load.
    const uploaderDeps = require("./uploader").getDefaultUploaderDeps();
    
    // Android foreground service (no-op on iOS)
    let foregroundService: ReturnType<typeof import("./android-foreground-service").createUploadForegroundService> | undefined;
    try {
      const { Platform } = require("react-native") as { Platform: { OS: string } };
      if (Platform.OS === "android") {
        const notifee = require("@notifee/react-native").default as
          | import("./android-foreground-service").NotifeeLike
          | undefined;
        if (notifee) {
          const fgModule = require("./android-foreground-service") as {
            registerUploadForegroundTask: typeof import("./android-foreground-service").registerUploadForegroundTask;
            createUploadForegroundService: typeof import("./android-foreground-service").createUploadForegroundService;
          };
          fgModule.registerUploadForegroundTask(notifee);
          foregroundService = fgModule.createUploadForegroundService({
            notifee,
            platform: "android",
          });
        }
      }
    } catch {
      // notifee not available (dev builds may lag); fall back to no service
    }

    singleton = createUploadQueue({
      storage: AsyncStorage,
      uploader: uploaderDeps,
      uuid: () => Crypto.randomUUID(),
    });

    // Wire foreground service to queue state changes
    if (foregroundService) {
      const service = foregroundService;
      singleton.subscribe(() => {
        const jobs = singleton!.getJobs();
        const active = jobs.filter((j) =>
          j.state === "preprocessing" ||
          j.state === "uploading" ||
          j.state === "pending"
        ).length;
        
        if (active > 0) {
          // Compute average progress for in-flight jobs
          const uploading = jobs.filter((j) => j.state === "uploading");
          const avgProgress =
            uploading.length > 0
              ? uploading.reduce((sum, j) => sum + (j.progress ?? 0), 0) /
                uploading.length
              : undefined;
          void service.notifyActive({ active, progress: avgProgress });
        } else {
          void service.stop();
        }
      });
    }
  }
  return singleton;
}
