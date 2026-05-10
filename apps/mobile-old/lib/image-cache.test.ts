import { afterEach, describe, expect, it, vi } from "vitest";

import { Image } from "expo-image";

import { clearImageCachesOnSignOut, prefetchImages } from "./image-cache";

const ImageMock = Image as unknown as {
  clearMemoryCache: ReturnType<typeof vi.fn>;
  clearDiskCache: ReturnType<typeof vi.fn>;
  prefetch: ReturnType<typeof vi.fn>;
};

afterEach(() => {
  ImageMock.clearMemoryCache.mockClear();
  ImageMock.clearDiskCache.mockClear();
  ImageMock.prefetch.mockClear();
  // Restore default resolved-true behaviour from vitest.setup.ts.
  ImageMock.clearMemoryCache.mockResolvedValue(true);
  ImageMock.clearDiskCache.mockResolvedValue(true);
  ImageMock.prefetch.mockResolvedValue(true);
});

describe("clearImageCachesOnSignOut", () => {
  it("clears both expo-image caches", async () => {
    await clearImageCachesOnSignOut();
    expect(ImageMock.clearMemoryCache).toHaveBeenCalledTimes(1);
    expect(ImageMock.clearDiskCache).toHaveBeenCalledTimes(1);
  });

  it("never throws even when one cache call rejects", async () => {
    ImageMock.clearMemoryCache.mockRejectedValueOnce(new Error("mem boom"));
    ImageMock.clearDiskCache.mockRejectedValueOnce(new Error("disk boom"));
    await expect(clearImageCachesOnSignOut()).resolves.toBeUndefined();
  });
});

describe("prefetchImages", () => {
  it("forwards valid URIs to Image.prefetch with disk policy", async () => {
    await prefetchImages(["https://a/1.jpg", "https://a/2.jpg"]);
    expect(ImageMock.prefetch).toHaveBeenCalledWith(
      ["https://a/1.jpg", "https://a/2.jpg"],
      "disk",
    );
  });

  it("filters out null/undefined/empty strings", async () => {
    await prefetchImages([null, undefined, "", "https://a/ok.jpg"]);
    expect(ImageMock.prefetch).toHaveBeenCalledWith(
      ["https://a/ok.jpg"],
      "disk",
    );
  });

  it("skips the prefetch call entirely when no valid URIs remain", async () => {
    await prefetchImages([null, undefined, ""]);
    expect(ImageMock.prefetch).not.toHaveBeenCalled();
  });

  it("swallows prefetch failures so callers never see them", async () => {
    ImageMock.prefetch.mockRejectedValueOnce(new Error("network down"));
    await expect(prefetchImages(["https://a/1.jpg"])).resolves.toBeUndefined();
  });
});
