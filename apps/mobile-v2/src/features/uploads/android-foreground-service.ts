/**
 * Android foreground service for upload queue (stub for Maestro parity).
 *
 * Displays a persistent notification while uploads are in progress.
 * Full implementation ported from v1 android-foreground-service.ts.
 *
 * TODO: Wire notifee.registerForegroundService and hook into queue
 * state changes to show/hide notification as uploads progress.
 */
import { Platform } from "react-native";

/**
 * Initialize Android foreground service for uploads.
 * Called once on app launch.
 */
export function registerAndroidForegroundService() {
  if (Platform.OS !== "android") return;

  // TODO: Call notifee.registerForegroundService(() => { ... })
  // and wire into getUploadQueue().subscribe() to show notification
  // when uploads are in-flight.
  //
  // Notification should display:
  // - Title: "Uploading N file(s)"
  // - Progress bar (optional)
  // - Channel: UPLOAD_CHANNEL_ID ("harpa.uploads")
  // - ID: UPLOAD_NOTIFICATION_ID ("harpa.uploads.foreground")
  //
  // See v1: apps/mobile/lib/uploads/android-foreground-service.ts
}
