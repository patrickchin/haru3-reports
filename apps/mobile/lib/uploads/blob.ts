/**
 * URI → Blob conversion for uploads.
 *
 * Replaces the legacy `readAsStringAsync(..., Base64)` → `atob` →
 * `Uint8Array` round-trip that peaked at ~3-4× the file size in JS heap
 * and was implicated in Samsung Galaxy lmkd kills during photo capture
 * (see `docs/10-media-pipeline.md` §C). Native `fetch` returns a Blob
 * backed by the underlying file descriptor — no intermediate base64
 * string, no per-byte loop in JS.
 *
 * Schemes:
 *  - `file://`     — RN `fetch` reads directly. Default for camera + cache.
 *  - `content://`  — RN `fetch` reads via the Android ContentResolver.
 *  - `ph://` /
 *    `assets-library://` — iOS PhotoKit URIs that RN's `fetch` cannot
 *    open. We copy to the cache directory first via `expo-file-system`
 *    and re-issue the fetch against the resulting `file://` URI. Callers
 *    are responsible for cleaning up the cache copy when they're done
 *    (the upload queue does this on `uploaded` / `failed`).
 */
import * as FileSystem from "expo-file-system/legacy";

/** Dependencies — injected so tests don't need RN's fetch or expo-file-system. */
export interface UriToBlobDeps {
  fetch: typeof globalThis.fetch;
  copyAsync: (args: { from: string; to: string }) => Promise<void>;
  cacheDirectory: string | null;
  now: () => number;
}

const defaultDeps: UriToBlobDeps = {
  fetch: (...args) => globalThis.fetch(...args),
  copyAsync: FileSystem.copyAsync,
  cacheDirectory: FileSystem.cacheDirectory,
  now: () => Date.now(),
};

/**
 * Convert a local asset URI to a `Blob` suitable for direct upload via
 * `supabase.storage.from(...).upload(path, blob)` (which calls fetch
 * under the hood and streams the body without ever materializing it as
 * a base64 string in JS).
 *
 * Returns the blob plus the resolved file URI used to read it. Callers
 * that received a `ph://` URI can use the resolved URI to delete the
 * cache copy after upload.
 */
export async function uriToBlob(
  uri: string,
  depsOverride?: Partial<UriToBlobDeps>,
): Promise<{ blob: Blob; resolvedUri: string }> {
  const deps = { ...defaultDeps, ...depsOverride };

  let resolvedUri = uri;
  if (uri.startsWith("ph://") || uri.startsWith("assets-library://")) {
    if (!deps.cacheDirectory) {
      throw new Error("uriToBlob: cacheDirectory unavailable for ph:// copy");
    }
    const dest = `${deps.cacheDirectory}upload-${deps.now()}-${randomSuffix()}.jpg`;
    await deps.copyAsync({ from: uri, to: dest });
    resolvedUri = dest;
  }

  const response = await deps.fetch(resolvedUri);
  if (!response.ok && response.status !== 0) {
    // Some RN versions report status 0 for file:// reads even on success.
    // Only treat explicit non-OK statuses as errors.
    throw new Error(
      `uriToBlob: fetch failed (${response.status} ${response.statusText})`,
    );
  }
  const blob = await response.blob();
  return { blob, resolvedUri };
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 10);
}

/**
 * Best-effort deletion of a cache copy created by `uriToBlob` for a
 * `ph://` / `assets-library://` source. Callers pass the original URI
 * and the `resolvedUri` they received back from `uriToBlob`; we only
 * delete when the two differ (i.e. a copy actually happened). Safe to
 * call on every terminal transition — never throws.
 */
export async function deleteCacheCopyIfAny(
  originalUri: string,
  resolvedUri: string,
  depsOverride?: { deleteAsync?: (uri: string) => Promise<void> },
): Promise<void> {
  if (resolvedUri === originalUri) return;
  const deleteAsync = depsOverride?.deleteAsync ?? FileSystem.deleteAsync;
  try {
    await deleteAsync(resolvedUri);
  } catch {
    // best-effort — the OS will sweep the cache directory eventually.
  }
}
