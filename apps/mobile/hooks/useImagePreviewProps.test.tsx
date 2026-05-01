import React, { forwardRef, useImperativeHandle } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TestRenderer, { act } from "react-test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import type { FileMetadataRow } from "@/lib/file-upload";

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

const getSignedUrlMock = vi.fn<(...args: unknown[]) => Promise<string>>();

vi.mock("@/lib/file-upload", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/file-upload")>("@/lib/file-upload");
  return {
    ...actual,
    getSignedUrl: (
      ...args: Parameters<typeof actual.getSignedUrl>
    ): ReturnType<typeof actual.getSignedUrl> => getSignedUrlMock(...args),
  };
});

vi.mock("@/lib/backend", () => ({ backend: {} }));

import { useImagePreviewProps } from "./useImagePreviewProps";

type HookHandle = ReturnType<typeof useImagePreviewProps>;

interface ProbeProps {
  file: FileMetadataRow | null;
  adjacent?: ReadonlyArray<FileMetadataRow>;
}

const HookProbe = forwardRef<HookHandle, ProbeProps>(({ file, adjacent }, ref) => {
  const result = useImagePreviewProps(file, adjacent);
  useImperativeHandle(ref, () => result, [result]);
  return null;
});
HookProbe.displayName = "HookProbe";

function makeFile(overrides: Partial<FileMetadataRow> = {}): FileMetadataRow {
  return {
    id: "f1",
    project_id: "p1",
    uploaded_by: "u1",
    bucket: "project-files",
    storage_path: "p1/img.jpg",
    category: "image",
    filename: "img.jpg",
    mime_type: "image/jpeg",
    size_bytes: 1234,
    duration_ms: null,
    width: 4032,
    height: 3024,
    thumbnail_path: "p1/img.jpg.thumb.jpg",
    blurhash: "LEHV6nWB2yk8pyo0adR*.7kCMdnj",
    ...(overrides as object),
  } as FileMetadataRow;
}

function renderProbe(props: ProbeProps) {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const ref = React.createRef<HookHandle>();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <QueryClientProvider client={client}>
        <HookProbe ref={ref} {...props} />
      </QueryClientProvider>,
    );
  });
  return {
    client,
    get current() {
      if (!ref.current) throw new Error("hook not mounted");
      return ref.current;
    },
    update: (next: ProbeProps) =>
      act(() => {
        renderer.update(
          <QueryClientProvider client={client}>
            <HookProbe ref={ref} {...next} />
          </QueryClientProvider>,
        );
      }),
  };
}

describe("useImagePreviewProps", () => {
  beforeEach(() => {
    getSignedUrlMock.mockReset();
  });
  afterEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = false;
  });

  it("returns null props for a null file", () => {
    const probe = renderProbe({ file: null });
    expect(probe.current).toEqual({
      uri: null,
      cacheKey: undefined,
      intrinsicWidth: undefined,
      intrinsicHeight: undefined,
      placeholderUri: null,
      blurhash: null,
      prefetchUris: [],
    });
  });

  it("forwards width/height/blurhash/cacheKey from the focused file", () => {
    getSignedUrlMock.mockResolvedValue("https://signed/url");
    const probe = renderProbe({ file: makeFile() });
    expect(probe.current.cacheKey).toBe("p1/img.jpg");
    expect(probe.current.intrinsicWidth).toBe(4032);
    expect(probe.current.intrinsicHeight).toBe(3024);
    expect(probe.current.blurhash).toBe("LEHV6nWB2yk8pyo0adR*.7kCMdnj");
  });

  it("resolves the placeholder + full-res signed URLs via TanStack Query", async () => {
    getSignedUrlMock.mockImplementation(async (_backend: unknown, path: unknown) =>
      path === "p1/img.jpg.thumb.jpg"
        ? "https://signed/thumb"
        : "https://signed/full",
    );
    const probe = renderProbe({ file: makeFile() });
    // Flush microtasks so both effect fetchQuery calls resolve.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(getSignedUrlMock).toHaveBeenCalledWith({}, "p1/img.jpg.thumb.jpg");
    expect(getSignedUrlMock).toHaveBeenCalledWith({}, "p1/img.jpg");
    expect(probe.current.placeholderUri).toBe("https://signed/thumb");
    expect(probe.current.uri).toBe("https://signed/full");
  });

  it("collects prefetch URIs from already-cached signed URLs", () => {
    const focused = makeFile();
    const adjacentA = makeFile({ id: "a", storage_path: "p1/a.jpg" });
    const adjacentB = makeFile({ id: "b", storage_path: "p1/b.jpg" });
    getSignedUrlMock.mockResolvedValue("https://signed/any");

    const probe = renderProbe({ file: focused, adjacent: [adjacentA, adjacentB] });
    // Pre-seed the TanStack cache with one cached signed URL (the other
    // is intentionally absent so the filter is exercised).
    probe.client.setQueryData(
      ["project-file-signed-url", "p1/a.jpg"],
      "https://signed/a",
    );
    probe.update({ file: focused, adjacent: [adjacentA, adjacentB] });
    expect(probe.current.prefetchUris).toEqual(["https://signed/a"]);
  });

  it("clears the placeholder when the focused file has no thumbnail", () => {
    getSignedUrlMock.mockResolvedValue("https://signed/full");
    const probe = renderProbe({
      file: makeFile({ thumbnail_path: null }),
    });
    expect(probe.current.placeholderUri).toBeNull();
    // The thumbnail fetch is skipped, but the full-res fetch still runs.
    expect(getSignedUrlMock).toHaveBeenCalledWith({}, "p1/img.jpg");
    expect(getSignedUrlMock).not.toHaveBeenCalledWith({}, "p1/img.jpg.thumb.jpg");
  });
});
