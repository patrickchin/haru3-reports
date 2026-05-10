/**
 * iOS background upload path.
 *
 * Why this file exists: the foreground-uriToBlob → bucket.upload(blob)
 * flow in the upload pipeline requires the JS runtime to stay alive
 * for the whole HTTPS request. iOS aggressively suspends backgrounded
 * apps within ~30s, so any in-flight Supabase upload will be torn down
 * if the user switches apps mid-burst.
 *
 * The fix is to hand the request to NSURLSession via
 * `expo-file-system/legacy`'s `createUploadTask` with
 * `FileSystemSessionType.BACKGROUND`. The OS owns the socket and
 * delivers the response back to us when we relaunch.
 *
 * Auth is handled with a one-shot signed upload URL minted via
 * `bucket.createSignedUploadUrl(path)` — no Bearer token needed on the
 * PUT, which means the request survives session-token refreshes.
 *
 * Thumbnails are tiny (<50KB) and best-effort, so we keep them on the
 * normal foreground path; they're not worth a second background task.
 *
 * Note: expo-file-system/legacy requires SDK 55+ for background sessions.
 * This module is a no-op on older SDKs or non-iOS platforms.
 */

// ----- Types -----------------------------------------------------------------

export interface BackgroundUploadArgs {
  signedUrl: string;
  fileUri: string;
  mimeType: string;
  onProgress?: (fraction: number) => void;
}

/**
 * Injected adapter wrapping expo-file-system/legacy createUploadTask
 * with BACKGROUND session. Resolves on 2xx; rejects with a descriptive
 * Error otherwise.
 */
export type UploadViaBackgroundSession = (
  args: BackgroundUploadArgs,
) => Promise<void>;

// ----- Implementation --------------------------------------------------------

/**
 * Platform-specific factory. Returns undefined on Android/web.
 * Caller should check and fall back to foreground upload.
 *
 * Example usage (in queue singleton builder):
 * ```
 * const bgUpload = Platform.OS === 'ios'
 *   ? createBackgroundUploadAdapter()
 *   : undefined;
 * ```
 */
export function createBackgroundUploadAdapter(): UploadViaBackgroundSession | undefined {
  // Stub for now — full NSURLSession integration deferred until
  // Wave M addresses upload-completion handlers. The v1 implementation
  // uses expo-file-system/legacy which is available in v2 but requires
  // wiring into the uploader's uploadToStorage path.
  //
  // When implemented, the adapter should:
  //   1. Require expo-file-system/legacy
  //   2. Call createUploadTask(signedUrl, fileUri, {
  //        httpMethod: "PUT",
  //        uploadType: BINARY_CONTENT,
  //        sessionType: BACKGROUND,
  //        mimeType,
  //      })
  //   3. await task.uploadAsync()
  //   4. Validate 2xx status; reject on error
  //
  // See v1: apps/mobile/lib/uploads/ios-background-upload.ts
  // and apps/mobile/lib/uploads/build-default-queue.ts:145-172

  return undefined;
}
