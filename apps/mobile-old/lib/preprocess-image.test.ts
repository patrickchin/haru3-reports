import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("expo-image-manipulator", () => {
  let call = 0;
  return {
    manipulateAsync: vi.fn(async (uri: string, ops: unknown[]) => {
      call += 1;
      // First call resizes the original, second call resizes the thumb.
      // We echo back the requested resize dims so the test can assert
      // the chain ran with the planResize output.
      const op = ops[0] as { resize?: { width: number; height: number } } | undefined;
      const w = op?.resize?.width ?? 4032;
      const h = op?.resize?.height ?? 3024;
      return { uri: `${uri}#${call}`, width: w, height: h };
    }),
    SaveFormat: { JPEG: "jpeg", PNG: "png" },
  };
});

vi.mock("expo-image", () => {
  const Image = Object.assign(() => null, {
    generateBlurhashAsync: vi.fn(),
  });
  return { Image };
});

import { Image as ExpoImage } from "expo-image";
import {
  BLURHASH_COMPONENTS,
  MAX_ORIGINAL_EDGE_PX,
  MAX_THUMBNAIL_EDGE_PX,
  planResize,
  preprocessImageForUpload,
} from "./preprocess-image";

describe("planResize", () => {
  it("returns null resize when the source already fits", () => {
    expect(planResize(1024, 768, MAX_ORIGINAL_EDGE_PX)).toEqual({ resize: null });
    expect(planResize(MAX_ORIGINAL_EDGE_PX, 100, MAX_ORIGINAL_EDGE_PX)).toEqual({
      resize: null,
    });
  });

  it("scales down a landscape image preserving aspect ratio", () => {
    const plan = planResize(4032, 3024, MAX_ORIGINAL_EDGE_PX);
    expect(plan.resize).not.toBeNull();
    expect(plan.resize!.width).toBe(2048);
    expect(plan.resize!.height).toBe(1536);
  });

  it("scales down a portrait image preserving aspect ratio", () => {
    const plan = planResize(3024, 4032, MAX_ORIGINAL_EDGE_PX);
    expect(plan.resize!.width).toBe(1536);
    expect(plan.resize!.height).toBe(2048);
  });

  it("uses a different cap for thumbnails", () => {
    const plan = planResize(4032, 3024, MAX_THUMBNAIL_EDGE_PX);
    expect(plan.resize!.width).toBe(400);
    expect(plan.resize!.height).toBe(300);
  });

  it("returns null resize for invalid input", () => {
    expect(planResize(0, 100, 2048)).toEqual({ resize: null });
    expect(planResize(100, -1, 2048)).toEqual({ resize: null });
    expect(planResize(Number.NaN, 100, 2048)).toEqual({ resize: null });
  });
});

describe("preprocessImageForUpload", () => {
  beforeEach(() => {
    vi.mocked(ExpoImage.generateBlurhashAsync).mockReset();
  });

  it("produces an original + thumbnail and forwards the blurhash", async () => {
    vi.mocked(ExpoImage.generateBlurhashAsync).mockResolvedValueOnce(
      "LEHV6nWB2yk8pyo0adR*.7kCMdnj",
    );
    const result = await preprocessImageForUpload(
      "file:///tmp/photo.heic",
      4032,
      3024,
    );
    expect(result.originalUri).toBe("file:///tmp/photo.heic#1");
    expect(result.thumbnailUri).toBe("file:///tmp/photo.heic#1#2");
    expect(result.width).toBe(2048);
    expect(result.height).toBe(1536);
    expect(result.mimeType).toBe("image/jpeg");
    expect(result.blurhash).toBe("LEHV6nWB2yk8pyo0adR*.7kCMdnj");
    expect(ExpoImage.generateBlurhashAsync).toHaveBeenCalledWith(
      "file:///tmp/photo.heic#1#2",
      BLURHASH_COMPONENTS,
    );
  });

  it("returns null blurhash when generation fails (capture is never blocked)", async () => {
    vi.mocked(ExpoImage.generateBlurhashAsync).mockRejectedValueOnce(
      new Error("native module unavailable"),
    );
    const result = await preprocessImageForUpload(
      "file:///tmp/photo.heic",
      4032,
      3024,
    );
    expect(result.blurhash).toBeNull();
    // Pixels were still produced so the upload can proceed.
    expect(result.originalUri.startsWith("file:///tmp/photo.heic#")).toBe(true);
    expect(result.thumbnailUri).toContain(result.originalUri);
  });
});
