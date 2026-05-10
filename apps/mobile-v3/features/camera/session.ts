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

export function createCameraSession(): {
  sessionId: string;
  promise: Promise<string[]>;
} {
  const sessionId = `cam_${Date.now()}_${++counter}`;
  const promise = new Promise<string[]>((resolve, reject) => {
    sessions.set(sessionId, { resolve, reject });
  });
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
