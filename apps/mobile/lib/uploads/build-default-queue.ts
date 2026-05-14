/**
 * Production wire-up for the singleton upload queue.
 *
 * This file exists purely to keep dependency injection (require()s of
 * native Expo modules, AsyncStorage, notifee, etc.) out of the
 * unit-tested `queue.ts` runtime. It is intentionally excluded from
 * the Vitest coverage report (see `vitest.config.ts`) because every
 * line is glue — `require(...)` calls and dep wiring — that would
 * need a JS runtime with the actual native modules linked to exercise.
 * The behaviour it composes is exhaustively tested via
 * `createUploadQueue` + injected fakes in `queue.test.ts`,
 * `uploader.test.ts`, `ios-background-upload.test.ts`, and
 * `android-foreground-service.test.ts`.
 *
 * Maestro smoke flows exercise the wired-up singleton end-to-end on
 * real devices.
 */
import {
  createUploadQueue,
  type StorageLike,
  type UploadQueue,
} from "./queue";
import type { UploaderDeps } from "./uploader";
import type { UploadForegroundService } from "./android-foreground-service";
import { safeRandomUUID } from "@/lib/uuid";

// ----- Singleton accessor ----------------------------------------------------

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

// ----- Internal --------------------------------------------------------------

// Delegated to the canonical safeRandomUUID helper so the
// no-direct-crypto regression guard catches future regressions in one
// place. Same fallback shape as the rest of the app.
const defaultUuid = (): string => safeRandomUUID();

// ----- Builder ---------------------------------------------------------------

export function buildDefaultQueue(): UploadQueue {
  // Lazy-require RN-only modules so unit tests can import this file
  // without dragging in expo-file-system / AsyncStorage.
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
    uuid: defaultUuid,
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
      // PR-8: optimistic placeholder rows so the file tray can show
      // greyed-out tiles the instant a job is enqueued, before bytes
      // hit storage. Android only — the iOS background-upload path
      // takes precedence and never inserts a placeholder, so enabling
      // it on iOS would be a no-op that confuses readers. Wiring the
      // iOS background-completion handler into finalizePlaceholderRow
      // is deferred (see `useOptimisticPlaceholder` doc in uploader.ts).
      useOptimisticPlaceholder: Platform.OS === "android",
    },
    foregroundService,
  });
}
