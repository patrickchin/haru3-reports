/**
 * Lightweight image-load telemetry. Records duration + cache-hit hints
 * that surface in dev console and (optionally) get forwarded to the
 * Sentry/Supabase sink at the call site.
 *
 * Keep this file pure-TS (no native imports) so it is easy to test.
 */

export type ImageLoadSource = "cache" | "network" | "unknown";

export interface ImageLoadEvent {
  /** Stable identifier (storage path is preferred over signed URL). */
  cacheKey: string | null;
  /** Wall-clock milliseconds between mount and `onLoadEnd`. */
  durationMs: number;
  /** Decoded image bytes, when reported by `onLoad`. */
  sizeBytes: number | null;
  /** Whether the pixels came from cache or were freshly downloaded. */
  source: ImageLoadSource;
}

export type ImageLoadSink = (event: ImageLoadEvent) => void;

let activeSink: ImageLoadSink = defaultSink;

function defaultSink(event: ImageLoadEvent): void {
  if (typeof __DEV__ !== "undefined" && __DEV__) {
    // eslint-disable-next-line no-console
    console.debug(
      `[image] load key=${event.cacheKey ?? "?"} ${event.durationMs}ms ` +
        `${event.sizeBytes ?? "?"}B src=${event.source}`,
    );
  }
}

/**
 * Replace the active sink (e.g. forward to Sentry/Supabase). Returns the
 * previous sink so the caller can restore it (used in tests).
 */
export function setImageLoadSink(sink: ImageLoadSink): ImageLoadSink {
  const prev = activeSink;
  activeSink = sink;
  return prev;
}

export function recordImageLoad(event: ImageLoadEvent): void {
  try {
    activeSink(event);
  } catch {
    // Telemetry must never crash the app.
  }
}

declare const __DEV__: boolean;
