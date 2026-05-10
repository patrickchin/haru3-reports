import { beforeEach, describe, expect, it, vi } from "vitest";

const { fs, sharing } = vi.hoisted(() => ({
  fs: {
    cacheDirectory: "file:///cache/" as string | null,
    getInfoAsync: vi.fn(),
    makeDirectoryAsync: vi.fn(),
    downloadAsync: vi.fn(),
  },
  sharing: {
    isAvailableAsync: vi.fn(),
    shareAsync: vi.fn(),
  },
}));

vi.mock("expo-file-system/legacy", () => fs);
vi.mock("expo-sharing", () => sharing);

import { shareImage, SHARED_IMAGE_CACHE_DIR_NAME } from "./image-share";

const baseArgs = {
  fileId: "file-123",
  signedUrl: "https://example.com/image.jpg",
  intent: "share" as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  fs.cacheDirectory = "file:///cache/";
  fs.getInfoAsync.mockResolvedValue({ exists: false });
  fs.makeDirectoryAsync.mockResolvedValue(undefined);
  fs.downloadAsync.mockResolvedValue({ status: 200 });
  sharing.isAvailableAsync.mockResolvedValue(true);
  sharing.shareAsync.mockResolvedValue(undefined);
});

describe("shareImage", () => {
  it("downloads to cache then shares with the share dialog title", async () => {
    await shareImage({ ...baseArgs, mimeType: "image/png" });

    const expectedUri = `file:///cache/${SHARED_IMAGE_CACHE_DIR_NAME}/file-123.png`;
    expect(fs.makeDirectoryAsync).toHaveBeenCalledWith(
      `file:///cache/${SHARED_IMAGE_CACHE_DIR_NAME}/`,
      { intermediates: true },
    );
    expect(fs.downloadAsync).toHaveBeenCalledWith(baseArgs.signedUrl, expectedUri);
    expect(sharing.shareAsync).toHaveBeenCalledWith(expectedUri, {
      mimeType: "image/png",
      UTI: "public.image",
      dialogTitle: "Share photo",
    });
  });

  it("uses the download dialog title for the download intent", async () => {
    await shareImage({ ...baseArgs, intent: "download" });

    expect(sharing.shareAsync).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ dialogTitle: "Save photo" }),
    );
  });

  it("skips re-downloading when the cached file already exists", async () => {
    fs.getInfoAsync.mockResolvedValueOnce({ exists: true });

    await shareImage(baseArgs);

    expect(fs.makeDirectoryAsync).not.toHaveBeenCalled();
    expect(fs.downloadAsync).not.toHaveBeenCalled();
    expect(sharing.shareAsync).toHaveBeenCalled();
  });

  it("falls back to image/jpeg mime + jpg extension when no hints provided", async () => {
    await shareImage(baseArgs);

    const expectedUri = `file:///cache/${SHARED_IMAGE_CACHE_DIR_NAME}/file-123.jpg`;
    expect(fs.downloadAsync).toHaveBeenCalledWith(baseArgs.signedUrl, expectedUri);
    expect(sharing.shareAsync).toHaveBeenCalledWith(
      expectedUri,
      expect.objectContaining({ mimeType: "image/jpeg" }),
    );
  });

  it("derives the extension from the filename when mime is unknown", async () => {
    await shareImage({
      ...baseArgs,
      mimeType: "application/octet-stream",
      filename: "photo.HEIC",
    });

    expect(fs.downloadAsync).toHaveBeenCalledWith(
      baseArgs.signedUrl,
      `file:///cache/${SHARED_IMAGE_CACHE_DIR_NAME}/file-123.heic`,
    );
  });

  it("throws when the signed URL is missing", async () => {
    await expect(shareImage({ ...baseArgs, signedUrl: null })).rejects.toThrow(
      /Image is not ready/,
    );
    expect(sharing.shareAsync).not.toHaveBeenCalled();
  });

  it("throws when the platform has no cache directory", async () => {
    fs.cacheDirectory = null;

    await expect(shareImage(baseArgs)).rejects.toThrow(/Local cache is unavailable/);
    expect(sharing.shareAsync).not.toHaveBeenCalled();
  });

  it("throws when sharing is unavailable", async () => {
    sharing.isAvailableAsync.mockResolvedValueOnce(false);

    await expect(shareImage(baseArgs)).rejects.toThrow(/Sharing is not available/);
    expect(sharing.shareAsync).not.toHaveBeenCalled();
  });

  it("throws when the download responds with a non-2xx status", async () => {
    fs.downloadAsync.mockResolvedValueOnce({ status: 404 });

    await expect(shareImage(baseArgs)).rejects.toThrow(/HTTP 404/);
    expect(sharing.shareAsync).not.toHaveBeenCalled();
  });
});
