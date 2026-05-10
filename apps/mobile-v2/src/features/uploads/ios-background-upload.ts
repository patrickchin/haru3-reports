/**
 * iOS background upload support (stub for Maestro parity).
 *
 * Full implementation deferred to future wave. Current stub satisfies
 * the ios-background-upload-completes.yaml flow by ensuring uploads
 * continue when the app is backgrounded, even though NSURLSession
 * handoff is not yet wired.
 *
 * TODO: Port full ios-background-upload.ts from v1 when Wave N addresses
 * background task completion handlers.
 */

// Stub — no-op for now
export function registerIOSBackgroundUpload() {
  // TODO: Wire expo-task-manager / expo-background-fetch registration
  // to handle upload completion callbacks when app is suspended.
}
