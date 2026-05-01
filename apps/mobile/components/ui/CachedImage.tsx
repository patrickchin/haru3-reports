import { useRef } from "react";
import { Image, type ImageProps } from "expo-image";
import type { StyleProp, ImageStyle } from "react-native";
import { computeAspectStyle } from "@/lib/image-aspect";
import {
  recordImageLoad,
  type ImageLoadSource,
} from "@/lib/image-telemetry";

/**
 * Thin wrapper around `expo-image`'s `<Image>` with the defaults required
 * for project file thumbnails and previews:
 *
 *   - `cachePolicy="disk"` — SDWebImage / Coil persists pixels across app
 *     launches (RN's built-in `<Image>` has no disk cache).
 *   - Optional `cacheKey` — pin the cache entry to a stable storage path
 *     so rotating signed-URL tokens don't invalidate the cache.
 *   - 200 ms cross-fade transition on load.
 *   - `intrinsicWidth` / `intrinsicHeight` props drive `style.aspectRatio`
 *     to prevent layout shift while loading.
 *   - Optional `placeholder` (commonly the small thumbnail signed URL)
 *     gives users an instant preview while the full-res original loads.
 *   - `onLoadEnd` records load duration to the telemetry sink.
 *
 * For local file URIs (e.g. an upload preview from the camera roll) it
 * is also fine: `expo-image` skips its remote cache for `file://`
 * sources.
 */
export interface CachedImageProps extends ImageProps {
  /** Pixel width of the source image, used for aspect-ratio placeholder. */
  intrinsicWidth?: number | null;
  /** Pixel height of the source image, used for aspect-ratio placeholder. */
  intrinsicHeight?: number | null;
  /**
   * Stable cache key (e.g. storage path) so rotating signed-URL tokens
   * don't invalidate the disk cache. Forwarded to `expo-image`.
   */
  cacheKey?: string;
  /**
   * Encoded BlurHash. When `placeholder` is not provided, the blurhash
   * is rendered as the placeholder so the user sees a colour
   * approximation of the image immediately.
   */
  blurhash?: string | null;
}

export function CachedImage({
  intrinsicWidth,
  intrinsicHeight,
  cachePolicy = "disk",
  contentFit = "cover",
  transition = 200,
  style,
  cacheKey,
  blurhash,
  placeholder,
  source,
  onLoadStart,
  onLoadEnd,
  onLoad,
  ...rest
}: CachedImageProps) {
  const aspectStyle = computeAspectStyle(intrinsicWidth, intrinsicHeight);
  const composedStyle: StyleProp<ImageStyle> = aspectStyle
    ? [aspectStyle, style as StyleProp<ImageStyle>]
    : (style as StyleProp<ImageStyle>);

  // expo-image's `cacheKey` lives on the source object (alongside `uri`).
  // We accept it as a top-level prop for ergonomics and merge it in here.
  const composedSource =
    cacheKey && source && typeof source === "object" && !Array.isArray(source)
      ? { ...(source as object), cacheKey }
      : source;

  // Prefer an explicit `placeholder` (e.g. a thumbnail signed URL); fall
  // back to the BlurHash so the user always sees something instantly.
  const composedPlaceholder = placeholder ?? (blurhash ? { blurhash } : undefined);

  const startedAt = useRef<number | null>(null);
  const sourceHint = useRef<ImageLoadSource>("unknown");
  const sizeBytes = useRef<number | null>(null);

  const handleLoadStart = () => {
    startedAt.current = Date.now();
    onLoadStart?.();
  };

  const handleLoad = (event: Parameters<NonNullable<ImageProps["onLoad"]>>[0]) => {
    // expo-image's onLoad payload includes a `cacheType` hint
    // ('memory' | 'disk' | 'none') we can map to source.
    const cacheType = (event as unknown as { cacheType?: string })?.cacheType;
    sourceHint.current = cacheType && cacheType !== "none" ? "cache" : "network";
    onLoad?.(event);
  };

  const handleLoadEnd = () => {
    const start = startedAt.current;
    const duration = start != null ? Date.now() - start : 0;
    recordImageLoad({
      cacheKey: cacheKey ?? null,
      durationMs: duration,
      sizeBytes: sizeBytes.current,
      source: sourceHint.current,
    });
    onLoadEnd?.();
  };

  return (
    <Image
      {...rest}
      source={composedSource}
      placeholder={composedPlaceholder}
      cachePolicy={cachePolicy}
      contentFit={contentFit}
      transition={transition}
      style={composedStyle}
      onLoadStart={handleLoadStart}
      onLoad={handleLoad}
      onLoadEnd={handleLoadEnd}
    />
  );
}
