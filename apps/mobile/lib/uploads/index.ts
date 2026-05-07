/**
 * Public surface of the upload queue.
 *
 * Consumers should import from `@/lib/uploads`, not the individual
 * files inside this directory.
 */
export {
  reduce,
  isTerminal,
  createJob,
  backoffMs,
  shouldAutoRetry,
  toPersisted,
  fromPersisted,
  MAX_AUTO_ATTEMPTS,
  type UploadKind,
  type UploadJob,
  type UploadJobState,
  type EnqueueInput,
  type PersistedJob,
  type JobEvent,
} from "./jobs";

export {
  createUploadQueue,
  getUploadQueue,
  __resetUploadQueueForTests,
  QUEUE_STORAGE_KEY,
  type UploadQueue,
  type UploadQueueDeps,
  type StorageLike,
} from "./queue";

export { uriToBlob, type UriToBlobDeps } from "./blob";

export {
  runUploadJob,
  type UploaderDeps,
  type UploaderHandlers,
  type UploaderResult,
} from "./uploader";

export {
  uploadProjectFileViaBackground,
  type BackgroundUploadArgs,
  type BackgroundUploadDeps,
  type BackgroundUploadParams,
  type UploadViaBackgroundSession,
} from "./ios-background-upload";

export {
  createUploadForegroundService,
  registerUploadForegroundTask,
  UPLOAD_CHANNEL_ID,
  UPLOAD_NOTIFICATION_ID,
  type NotifeeLike,
  type UploadForegroundService,
  type UploadServiceCounts,
} from "./android-foreground-service";

export {
  runPreprocessStep,
  type PreprocessDeps,
  type PreprocessOutcome,
} from "./preprocess-step";
