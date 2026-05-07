/**
 * Android foreground service for in-flight uploads.
 *
 * Why this file exists: Android's `lmkd` (low-memory killer) reaps
 * background processes aggressively — especially after the user opens
 * a heavy app like the camera. If we're mid-upload when that happens,
 * the JS runtime dies and the queue resumes from disk on next launch.
 *
 * Promoting the app to FOREGROUND_SERVICE_DATA_SYNC tells the OS
 * "I'm doing user-visible work, please keep me alive." The user sees a
 * persistent notification ("Uploading 3 files…"). When the queue
 * settles we tear the service down so the notification disappears.
 *
 * Caveats:
 *   - This does NOT survive swipe-kill. If the user force-quits the
 *     app, the service dies with it. (NSURLSession-style true OS
 *     handoff does not exist on Android for arbitrary HTTPS PUTs.)
 *   - Requires POST_NOTIFICATIONS runtime permission on Android 13+;
 *     we ask for it on first enqueue and degrade gracefully if denied
 *     (the upload still runs while the app is foreground).
 *   - iOS has its own background path (PR-5); on iOS this module is
 *     an inert no-op.
 *
 * notifee MUST be injected so unit tests don't need the native module.
 */

// ----- Types -----------------------------------------------------------------

export interface NotifeeLike {
  /**
   * Register the headless task that keeps the service alive. Must be
   * called before the first `displayNotification({asForegroundService:
   * true})`. The queue calls it lazily on first enqueue, which is
   * safe because notifee only spawns the OS service when we display
   * the foreground notification (not at registration time).
   */
  registerForegroundService: (
    runner: (notification: { id: string }) => Promise<void>,
  ) => void;
  requestPermission: () => Promise<{ authorizationStatus: number }>;
  createChannel: (channel: {
    id: string;
    name: string;
    importance?: number;
  }) => Promise<string>;
  displayNotification: (notification: {
    id: string;
    title: string;
    body?: string;
    android: {
      channelId: string;
      asForegroundService: true;
      ongoing?: boolean;
      smallIcon?: string;
      progress?: { max: number; current: number; indeterminate?: boolean };
      pressAction?: { id: string };
    };
  }) => Promise<string>;
  stopForegroundService: () => Promise<void>;
}

export interface UploadServiceCounts {
  /** Total jobs the service is currently keeping alive for. */
  active: number;
  /** Optional progress 0..1 averaged across active jobs. */
  progress?: number;
}

export interface UploadForegroundService {
  /**
   * Bump the active count. Spins up the service on the 0→1 transition.
   * Idempotent for repeat calls within a single job.
   */
  notifyActive: (counts: UploadServiceCounts) => Promise<void>;
  /**
   * Tear the service down. Call when the queue is fully idle.
   * Idempotent.
   */
  stop: () => Promise<void>;
}

export interface BuildServiceDeps {
  notifee: NotifeeLike;
  /** "android" | "ios" | "web" — only "android" wires the real service. */
  platform: string;
}

// Stable IDs so successive displayNotification calls update in place.
export const UPLOAD_CHANNEL_ID = "harpa.uploads";
export const UPLOAD_NOTIFICATION_ID = "harpa.uploads.foreground";

// ----- Implementation --------------------------------------------------------

/**
 * Builds a foreground-service controller. On non-Android platforms
 * returns a no-op stub.
 */
export function createUploadForegroundService(
  deps: BuildServiceDeps,
): UploadForegroundService {
  if (deps.platform !== "android") {
    return {
      notifyActive: async () => {
        /* no-op */
      },
      stop: async () => {
        /* no-op */
      },
    };
  }

  let started = false;
  let channelEnsured = false;

  const ensureChannel = async (): Promise<void> => {
    if (channelEnsured) return;
    await deps.notifee.createChannel({
      id: UPLOAD_CHANNEL_ID,
      name: "Background uploads",
      importance: 2, // LOW — silent, no heads-up
    });
    channelEnsured = true;
  };

  const buildNotification = (counts: UploadServiceCounts) => {
    const titleSuffix =
      counts.active === 1 ? "1 file" : `${counts.active} files`;
    return {
      id: UPLOAD_NOTIFICATION_ID,
      title: `Uploading ${titleSuffix}`,
      body:
        counts.progress != null
          ? `${Math.round(counts.progress * 100)}% complete`
          : undefined,
      android: {
        channelId: UPLOAD_CHANNEL_ID,
        asForegroundService: true as const,
        ongoing: true,
        smallIcon: "ic_notification",
        progress:
          counts.progress != null
            ? {
                max: 100,
                current: Math.round(counts.progress * 100),
                indeterminate: false,
              }
            : { max: 0, current: 0, indeterminate: true },
        pressAction: { id: "default" },
      },
    };
  };

  return {
    notifyActive: async (counts) => {
      if (counts.active <= 0) return;
      try {
        if (!started) {
          await deps.notifee.requestPermission();
          await ensureChannel();
        }
        await deps.notifee.displayNotification(buildNotification(counts));
        started = true;
      } catch {
        // Best-effort — if notifee throws (perm denied, channel error)
        // the upload still runs while the app is foreground.
      }
    },
    stop: async () => {
      if (!started) return;
      started = false;
      try {
        await deps.notifee.stopForegroundService();
      } catch {
        // Service may already be torn down by the OS; ignore.
      }
    },
  };
}

/**
 * One-time AppRegistry hook. Safe to call lazily on first enqueue
 * because notifee only spawns the OS service when we subsequently
 * call `displayNotification({asForegroundService: true})`. The
 * returned promise never resolves while the service is alive — that's
 * how notifee keeps the JS runtime warm.
 */
export function registerUploadForegroundTask(notifee: NotifeeLike): void {
  notifee.registerForegroundService(() => {
    // The promise resolves when stopForegroundService is called. There
    // is no work to do here — the queue runs independently in JS.
    return new Promise<void>(() => {
      /* intentionally pending */
    });
  });
}
