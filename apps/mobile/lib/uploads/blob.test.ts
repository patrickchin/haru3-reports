import { describe, expect, it, vi } from "vitest";

vi.mock("expo-file-system/legacy", () => ({
  copyAsync: vi.fn(),
  deleteAsync: vi.fn(),
  cacheDirectory: "file:///cache/",
}));

// `expo-file-system` (next API) is globally mocked in vitest.setup.ts
// with a `File` class whose `bytes()` returns an empty Uint8Array. The
// "uses default deps" test below relies on that default.

import { uriToBlob } from "./blob";

describe("uriToBlob", () => {
  it("reads file:// URIs directly without copying", async () => {
    const readBytes = vi
      .fn()
      .mockResolvedValue(new Uint8Array([1, 2, 3, 4, 5]));
    const copyAsync = vi.fn();
    const { body, resolvedUri } = await uriToBlob("file:///cache/photo.jpg", {
      readBytes,
      copyAsync,
      cacheDirectory: "file:///cache/",
      now: () => 1,
    });
    expect(readBytes).toHaveBeenCalledWith("file:///cache/photo.jpg");
    expect(copyAsync).not.toHaveBeenCalled();
    expect(resolvedUri).toBe("file:///cache/photo.jpg");
    expect(body.byteLength).toBe(5);
  });

  it("reads content:// URIs directly (Android)", async () => {
    const readBytes = vi.fn().mockResolvedValue(new Uint8Array([0, 1]));
    const { resolvedUri, body } = await uriToBlob(
      "content://media/external/images/1",
      {
        readBytes,
        copyAsync: vi.fn(),
        cacheDirectory: "file:///cache/",
        now: () => 1,
      },
    );
    expect(resolvedUri).toBe("content://media/external/images/1");
    expect(readBytes).toHaveBeenCalledTimes(1);
    expect(body.byteLength).toBe(2);
  });

  it("copies ph:// URIs to the cache directory before reading", async () => {
    const readBytes = vi.fn().mockResolvedValue(new Uint8Array(11));
    const copyAsync = vi.fn().mockResolvedValue(undefined);
    const { resolvedUri } = await uriToBlob("ph://ABC123", {
      readBytes,
      copyAsync,
      cacheDirectory: "file:///cache/",
      now: () => 42,
    });
    expect(copyAsync).toHaveBeenCalledTimes(1);
    const args = copyAsync.mock.calls[0]![0] as { from: string; to: string };
    expect(args.from).toBe("ph://ABC123");
    expect(args.to.startsWith("file:///cache/upload-42-")).toBe(true);
    expect(args.to.endsWith(".jpg")).toBe(true);
    expect(resolvedUri).toBe(args.to);
    expect(readBytes).toHaveBeenCalledWith(args.to);
  });

  it("copies assets-library:// URIs the same way", async () => {
    const copyAsync = vi.fn().mockResolvedValue(undefined);
    await uriToBlob("assets-library://asset/asset.JPG?id=1", {
      readBytes: vi.fn().mockResolvedValue(new Uint8Array(1)),
      copyAsync,
      cacheDirectory: "file:///cache/",
      now: () => 99,
    });
    expect(copyAsync).toHaveBeenCalledTimes(1);
  });

  it("throws when the cache directory is missing for a ph:// copy", async () => {
    await expect(
      uriToBlob("ph://X", {
        readBytes: vi.fn(),
        copyAsync: vi.fn(),
        cacheDirectory: null,
        now: () => 1,
      }),
    ).rejects.toThrow(/cacheDirectory unavailable/);
  });

  it("propagates read errors", async () => {
    const readBytes = vi.fn().mockRejectedValue(new Error("file not found"));
    await expect(
      uriToBlob("file:///missing.jpg", {
        readBytes,
        copyAsync: vi.fn(),
        cacheDirectory: "file:///cache/",
        now: () => 1,
      }),
    ).rejects.toThrow(/file not found/);
  });

  it("uses default deps when no override provided", async () => {
    // Smoke test: default deps wire up without throwing on construction.
    // The globally-mocked `File.bytes()` returns an empty Uint8Array, so
    // body is 0 bytes — this is just verifying the wire-up, not a real read.
    const { body, resolvedUri } = await uriToBlob("file:///nope.jpg");
    expect(resolvedUri).toBe("file:///nope.jpg");
    expect(body.byteLength).toBe(0);
  });

  it("falls back to the default `now` when not overridden (ph:// path)", async () => {
    // Omitting `now` forces the default lambda `() => Date.now()` to fire
    // on the ph:// copy path. Spy on Date.now so we can assert it was hit
    // without binding to a real wall-clock timestamp.
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1234567);
    try {
      const copyAsync = vi.fn().mockResolvedValue(undefined);
      const readBytes = vi.fn().mockResolvedValue(new Uint8Array(1));
      const { resolvedUri } = await uriToBlob("ph://DEFAULT-NOW", {
        readBytes,
        copyAsync,
        cacheDirectory: "file:///cache/",
        // no `now` — must use defaultDeps.now
      });
      expect(nowSpy).toHaveBeenCalled();
      expect(resolvedUri).toContain("upload-1234567-");
    } finally {
      nowSpy.mockRestore();
    }
  });
});
