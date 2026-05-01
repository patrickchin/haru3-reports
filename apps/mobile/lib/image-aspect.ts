/**
 * Compute a `style.aspectRatio` object for an image when the intrinsic
 * pixel dimensions are known, so the layout reserves space before the
 * pixels finish loading and avoids a content shift.
 *
 * Returns `null` when either dimension is missing or non-positive — in
 * that case the caller should fall back to a fixed-height placeholder.
 */
export function computeAspectStyle(
  width: number | null | undefined,
  height: number | null | undefined,
): { aspectRatio: number } | null {
  if (typeof width !== "number" || typeof height !== "number") return null;
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  if (width <= 0 || height <= 0) return null;
  return { aspectRatio: width / height };
}
