/**
 * Pre-warm the upload-queue singleton.
 *
 * The first call to `getUploadQueue()` is expensive: it synchronously
 * requires notifee, expo-file-system (legacy + new), the Supabase
 * client, the upload pipeline, and the iOS background-upload bridge,
 * and on Android it calls `notifee.registerForegroundService(...)`
 * inline. Doing that during the report screen's first render blocked
 * the JS thread long enough to be perceived as "report notes load
 * slowly".
 *
 * Calling this from `app/_layout.tsx` schedules the cost to run after
 * the first user-interaction frame so it never lands on a screen's
 * render-commit critical path.
 */
import { InteractionManager } from "react-native";
import { getUploadQueue } from "@/lib/uploads";

export function schedulePrewarmUploadQueue(
  // Indirection so tests can inject fakes without monkey-patching the
  // RN module surface.
  deps: {
    schedule?: (cb: () => void) => unknown;
    prewarm?: () => unknown;
  } = {},
): void {
  const schedule =
    deps.schedule ?? InteractionManager.runAfterInteractions.bind(InteractionManager);
  const prewarm = deps.prewarm ?? getUploadQueue;
  schedule(() => {
    try {
      prewarm();
    } catch {
      // Pre-warm failures are non-fatal — the queue lazily re-initialises
      // on real use. Swallow so a missing native module in dev/E2E never
      // takes down the app.
    }
  });
}
