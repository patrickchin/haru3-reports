/**
 * Pure planning + side-effecting wrapper around `expo-image-manipulator`
 * for capture-time image preprocessing.
 *
 * Two derivatives are produced from each source asset:
 *   - **original**: long-edge ≤ MAX_ORIGINAL_EDGE_PX, JPEG q=0.85.
 *     Replaces the raw HEIC/PNG asset coming off the camera or photo
 *     library before it is uploaded to storage. Cuts upload size by
 *     5–10× on modern phone cameras with no perceptible quality loss.
 *   - **thumbnail**: long-edge ≤ MAX_THUMBNAIL_EDGE_PX, JPEG q=0.7.
 *     Inline preview shown in list views without paying a full-res
 *     download. ~10–30 KB per image.
 *
 * `planResize` is exported separately so it can be unit-tested without
 * the native ImageManipulator import (Vitest cannot load Expo native
 * modules in node).
 */
import * as ImageManipulator from "expo-image-manipulator";
import { Image as ExpoImage } from "expo-image";

export const MAX_ORIGINAL_EDGE_PX = 2048;
export const MAX_THUMBNAIL_EDGE_PX = 400;
export const ORIGINAL_QUALITY = 0.85;
export const THUMBNAIL_QUALITY = 0.7;
/**
 * BlurHash component count (`xComponents`, `yComponents`). 4×3 is the
 * sweet spot for landscape phone photos per the wolt blurhash readme —
 * larger values produce nicer placeholders but quadratic CPU cost.
 */
export const BLURHASH_COMPONENTS: [number, number] = [4, 3];

export interface PreprocessResult {
  originalUri: string;
  thumbnailUri: string;
  width: number;
  height: number;
  mimeType: "image/jpeg";
  /** Encoded BlurHash string (null when generation fails on this device). */
  blurhash: string | null;
}

export interface PreprocessOptions {
  maxOriginalEdgePx?: number;
  maxThumbnailEdgePx?: number;
  originalQuality?: number;
  thumbnailQuality?: number;
}

export interface ResizePlan {
  resize: { width: number; height: number } | null;
}

/**
 * Pure: given a source size and a target long-edge cap, return the
 * dimensions the manipulator should resize to (or `null` when the
 * source already fits and no resize is needed).
 */
export function planResize(
  srcWidth: number,
  srcHeight: number,
  maxEdgePx: number,
): ResizePlan {
  if (
    !Number.isFinite(srcWidth) ||
    !Number.isFinite(srcHeight) ||
    srcWidth <= 0 ||
    srcHeight <= 0
  ) {
    return { resize: null };
  }
  const longEdge = Math.max(srcWidth, srcHeight);
  if (longEdge <= maxEdgePx) return { resize: null };
  const scale = maxEdgePx / longEdge;
  return {
    resize: {
      width: Math.round(srcWidth * scale),
      height: Math.round(srcHeight * scale),
    },
  };
}

export async function preprocessImageForUpload(
  uri: string,
  srcWidth: number,
  srcHeight: number,
  opts: PreprocessOptions = {},
): Promise<PreprocessResult> {
  const maxOriginal = opts.maxOriginalEdgePx ?? MAX_ORIGINAL_EDGE_PX;
  const maxThumb = opts.maxThumbnailEdgePx ?? MAX_THUMBNAIL_EDGE_PX;
  const originalQ = opts.originalQuality ?? ORIGINAL_QUALITY;
  const thumbQ = opts.thumbnailQuality ?? THUMBNAIL_QUALITY;

  const originalPlan = planResize(srcWidth, srcHeight, maxOriginal);
  const original = await ImageManipulator.manipulateAsync(
    uri,
    originalPlan.resize ? [{ resize: originalPlan.resize }] : [],
    { compress: originalQ, format: ImageManipulator.SaveFormat.JPEG },
  );

  const thumbPlan = planResize(original.width, original.height, maxThumb);
  const thumb = await ImageManipulator.manipulateAsync(
    original.uri,
    thumbPlan.resize ? [{ resize: thumbPlan.resize }] : [],
    { compress: thumbQ, format: ImageManipulator.SaveFormat.JPEG },
  );

  // Generate BlurHash from the thumbnail (cheaper than the original).
  // Failure is non-fatal — callers fall back to the JPEG thumbnail as
  // placeholder.
  let blurhash: string | null = null;
  try {
    blurhash = await ExpoImage.generateBlurhashAsync(
      thumb.uri,
      BLURHASH_COMPONENTS,
    );
  } catch {
    blurhash = null;
  }

  return {
    originalUri: original.uri,
    thumbnailUri: thumb.uri,
    width: original.width,
    height: original.height,
    mimeType: "image/jpeg",
    blurhash,
  };
}
