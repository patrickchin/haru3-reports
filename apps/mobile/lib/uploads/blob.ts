/**
 * URI → Blob conversion for uploads.
 *
 * Why this exists
 * ---------------
 * The supabase-js Storage client (`bucket.upload`) accepts a `Blob`,
 * `ArrayBuffer`, or `Uint8Array` body. Internally it issues a `fetch`
 * with `body: <thatValue>` to push bytes to Storage. For that POST to
 * succeed, the body must be re-readable by RN's networking layer.
 *
 * History
 * -------
 * v1 (`readAsStringAsync` + base64 + `atob` loop) was killed because the
 * base64 string + Uint8Array round-trip peaked at ~3-4× the file size in
 * JS heap and was implicated in Samsung Galaxy lmkd kills during photo
 * burst capture (see `docs/10-media-pipeline.md` §C).
 *
 * v2 (`fetch(file://...).blob()`) replaced v1 to avoid the base64 hop.
 * It worked on iOS but on Android RN release the resulting Blob is
 * backed by a one-shot file descriptor that the *next* hop
 * (`bucket.upload`'s internal POST) cannot re-stream — every camera
 * capture upload threw `TypeError: Network request failed` at the
 * Storage POST. Voice notes were unaffected because that path passes a
 * `Uint8Array` body, not a Blob; the iOS image path was unaffected
 * because it routes through `uploadProjectFileViaBackground`
 * (NSURLSession + signed-URL PUT) and never touches `uriToBlob` for the
 * main body.
 *
 * v3 wrapped the bytes returned by `File(uri).bytes()` in a JS-side
 * `Blob`. That broke at runtime on Android release with
 * `Error: Creating blobs from 'ArrayBuffer' and 'ArrayBufferView' are
 * not supported` — RN's Blob polyfill only accepts
 * `Blob | string` parts, not Uint8Array/ArrayBuffer.
 *
 * v4 (this file) reads the file with `expo-file-system`'s native
 * `File(uri).bytes()` API and passes the resulting `Uint8Array` body
 * straight through to `bucket.upload`. supabase-js's storage client
 * detects "not a Blob, not FormData" and sends the body verbatim with
 * the explicit `contentType` header. RN's fetch supports Uint8Array
 * bodies natively (this is the same path used by the voice-note
 * upload, which has been working in production for months). No Blob
 * construction, no base64, no broken file descriptor.
 *
 * Heap profile
 * ------------
 * Per upload, peak JS heap = 1× the post-preprocess image size
 * (~700 KB–1.5 MB for a typical phone JPEG). The upload queue is
 * single-flight, so a 20-photo burst peaks at ~1.5 MB JS heap, not
 * 30 MB — bytes are freed between jobs. This is materially better than
 * v1 (3-4× peak during base64) and only marginally worse than v2 in
 * the *iOS* case (which streams from the file descriptor with no JS
 * buffering at all). For Android, v3 is the smallest correct fix that
 * doesn't require migrating to the iOS-style background-upload path
 * (tracked separately — see `docs/10-media-pipeline.md` deferred
 * placeholder-completion plumbing).
 *
 * URI schemes
 * -----------
 *  - `file://`     — native read directly. Default for camera + cache.
 *  - `content://`  — native read via the Android ContentResolver.
 *  - `ph://` /
 *    `assets-library://` — iOS PhotoKit URIs. The native read path
 *    cannot open these directly, so we copy to the cache directory
 *    first via `expo-file-system`'s legacy `copyAsync`, then read
 *    against the resulting `file://` URI. Callers are responsible for
 *    cleaning up the cache copy when they're done; the upload queue
 *    does this on `uploaded` / `failed` via `deleteCacheCopyIfAny`.
 *
 * Note on `Blob.type`
 * -------------------
 * `bucket.upload(path, body, opts)` already takes an explicit
 * `contentType` option that wins over the Blob's own `.type`, so we do
 * not need to thread the input mime type through to the Blob
 * constructor. See `lib/uploads/uploader.ts` where `contentType` is
 * always set from `input.mimeType` (or the fixed `image/jpeg` for
 * thumbnails).
 */
import * as LegacyFileSystem from "expo-file-system/legacy";
import { File as ExpoFile } from "expo-file-system";

/**
 * Dependencies — injected so unit tests don't need RN's native bridge.
 *
 * `readBytes` is the only platform-touching dependency. It returns the
 * full file contents as a fresh `Uint8Array`. In production it wraps
 * `new File(uri).bytes()` from `expo-file-system`'s next API.
 */
export interface UriToBlobDeps {
  readBytes: (uri: string) => Promise<Uint8Array>;
  copyAsync: (args: { from: string; to: string }) => Promise<void>;
  cacheDirectory: string | null;
  now: () => number;
}

const defaultDeps: UriToBlobDeps = {
  readBytes: async (uri: string) => {
    // `bytes()` returns Uint8Array<ArrayBuffer>. The underlying buffer
    // is a fresh ArrayBuffer owned by JS, safe to pass to Blob and
    // safe to be re-read by supabase-js's internal fetch.
    return await new ExpoFile(uri).bytes();
  },
  copyAsync: LegacyFileSystem.copyAsync,
  cacheDirectory: LegacyFileSystem.cacheDirectory,
  now: () => Date.now(),
};

/**
 * Convert a local asset URI to a `Uint8Array` body suitable for direct
 * upload via `supabase.storage.from(...).upload(path, body)`.
 *
 * Returns the body bytes plus the resolved file URI used to read it.
 * Callers that received a `ph://` URI can use the resolved URI to
 * delete the cache copy after upload (see `deleteCacheCopyIfAny`).
 *
 * The legacy name `uriToBlob` is kept to avoid touching every call
 * site; the returned shape is now `{ body: Uint8Array, resolvedUri }`.
 * The field is named `body` (not `blob`) to make the type honest.
 */
export async function uriToBlob(
  uri: string,
  depsOverride?: Partial<UriToBlobDeps>,
): Promise<{ body: Uint8Array; resolvedUri: string; size: number }> {
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

  const body = await deps.readBytes(resolvedUri);
  return { body, resolvedUri, size: body.byteLength };
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
  const deleteAsync = depsOverride?.deleteAsync ?? LegacyFileSystem.deleteAsync;
  try {
    await deleteAsync(resolvedUri);
  } catch {
    // best-effort — the OS will sweep the cache directory eventually.
  }
}
