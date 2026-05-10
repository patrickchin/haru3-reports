/**
 * Camera session registry — lets callers await photo results from
 * the camera capture screen without tight coupling.
 *
 *   const { sessionId, promise } = createCameraSession();
 *   router.push(`/(app)/camera/capture?session=${sessionId}`);
 *   const uris = await promise; // resolved when user taps Done
 */

const sessions = new Map<
  string,
  { resolve: (uris: string[]) => void; reject: (reason?: unknown) => void }
>();

let counter = 0;

/** Default timeout (5 min) to prevent leaked sessions if camera is abandoned. */
const SESSION_TIMEOUT_MS = 5 * 60_000;

export function createCameraSession(): {
  sessionId: string;
  promise: Promise<string[]>;
} {
  const sessionId = `cam_${Date.now()}_${++counter}`;
  const promise = new Promise<string[]>((resolve, reject) => {
    sessions.set(sessionId, { resolve, reject });
  });

  // Auto-cancel abandoned sessions to prevent memory leaks
  setTimeout(() => cancelCameraSession(sessionId), SESSION_TIMEOUT_MS);

  return { sessionId, promise };
}

export function commitCameraSession(sessionId: string, uris: string[]): void {
  const entry = sessions.get(sessionId);
  if (entry) {
    entry.resolve(uris);
    sessions.delete(sessionId);
  }
}

export function cancelCameraSession(sessionId: string): void {
  const entry = sessions.get(sessionId);
  if (entry) {
    entry.resolve([]);
    sessions.delete(sessionId);
  }
}
