import { describe, expect, it, vi } from "vitest";

vi.mock("expo-file-system/legacy", () => ({
  copyAsync: vi.fn(),
  cacheDirectory: "file:///cache/",
}));

import { uriToBlob } from "./blob";

function fakeResponse(body: string, init?: { ok?: boolean; status?: number }) {
  const blob = new Blob([body], { type: "image/jpeg" });
  return {
    ok: init?.ok ?? true,
    status: init?.status ?? 200,
    statusText: "OK",
    blob: async () => blob,
  } as unknown as Response;
}

describe("uriToBlob", () => {
  it("fetches file:// URIs directly without copying", async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse("hello"));
    const copyAsync = vi.fn();
    const { blob, resolvedUri } = await uriToBlob("file:///cache/photo.jpg", {
      fetch: fetchMock,
      copyAsync,
      cacheDirectory: "file:///cache/",
      now: () => 1,
    });
    expect(fetchMock).toHaveBeenCalledWith("file:///cache/photo.jpg");
    expect(copyAsync).not.toHaveBeenCalled();
    expect(resolvedUri).toBe("file:///cache/photo.jpg");
    expect(blob.size).toBe(5);
    expect(blob.type).toBe("image/jpeg");
  });

  it("fetches content:// URIs directly (Android)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse("xx"));
    const { resolvedUri } = await uriToBlob(
      "content://media/external/images/1",
      {
        fetch: fetchMock,
        copyAsync: vi.fn(),
        cacheDirectory: "file:///cache/",
        now: () => 1,
      },
    );
    expect(resolvedUri).toBe("content://media/external/images/1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("copies ph:// URIs to the cache directory before fetching", async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse("photo-bytes"));
    const copyAsync = vi.fn().mockResolvedValue(undefined);
    const { resolvedUri } = await uriToBlob("ph://ABC123", {
      fetch: fetchMock,
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
    expect(fetchMock).toHaveBeenCalledWith(args.to);
  });

  it("copies assets-library:// URIs the same way", async () => {
    const copyAsync = vi.fn().mockResolvedValue(undefined);
    await uriToBlob("assets-library://asset/asset.JPG?id=1", {
      fetch: vi.fn().mockResolvedValue(fakeResponse("x")),
      copyAsync,
      cacheDirectory: "file:///cache/",
      now: () => 99,
    });
    expect(copyAsync).toHaveBeenCalledTimes(1);
  });

  it("throws when the cache directory is missing for a ph:// copy", async () => {
    await expect(
      uriToBlob("ph://X", {
        fetch: vi.fn(),
        copyAsync: vi.fn(),
        cacheDirectory: null,
        now: () => 1,
      }),
    ).rejects.toThrow(/cacheDirectory unavailable/);
  });

  it("throws on non-OK fetch responses", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
      blob: async () => new Blob(),
    } as unknown as Response);
    await expect(
      uriToBlob("file:///missing.jpg", {
        fetch: fetchMock,
        copyAsync: vi.fn(),
        cacheDirectory: "file:///cache/",
        now: () => 1,
      }),
    ).rejects.toThrow(/fetch failed.*404/);
  });

  it("treats status 0 as success (RN file:// quirk)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 0,
      statusText: "",
      blob: async () => new Blob(["abc"]),
    } as unknown as Response);
    const { blob } = await uriToBlob("file:///x.jpg", {
      fetch: fetchMock,
      copyAsync: vi.fn(),
      cacheDirectory: "file:///cache/",
      now: () => 1,
    });
    expect(blob.size).toBe(3);
  });

  it("uses default deps when no override provided", async () => {
    // Smoke test: default deps wire up without throwing on construction.
    // The actual fetch will fail in node, so we expect a rejection.
    await expect(uriToBlob("file:///nope")).rejects.toBeDefined();
  });
});
