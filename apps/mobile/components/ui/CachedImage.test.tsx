import React from "react";
import { describe, expect, it, vi } from "vitest";
import TestRenderer, { act } from "react-test-renderer";

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

// Capture the props expo-image's <Image> receives so we can assert on the
// composed source / placeholder / cacheKey.
const captured: Array<Record<string, unknown>> = [];

vi.mock("expo-image", () => {
  const Image = Object.assign(
    (props: Record<string, unknown>) => {
      captured.push(props);
      return null;
    },
    {
      generateBlurhashAsync: vi.fn(async () => null),
      clearMemoryCache: vi.fn(async () => true),
      clearDiskCache: vi.fn(async () => true),
      prefetch: vi.fn(async () => true),
    },
  );
  return { Image };
});

import { CachedImage } from "./CachedImage";

function render(element: React.ReactElement) {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(element);
  });
  return renderer;
}

describe("CachedImage", () => {
  it("merges the cacheKey into the source object (not as a top-level prop)", () => {
    captured.length = 0;
    render(
      <CachedImage
        source={{ uri: "https://example.com/x.jpg" }}
        cacheKey="projects/p/files/x.jpg"
      />,
    );
    const props = captured.at(-1)!;
    expect(props.source).toEqual({
      uri: "https://example.com/x.jpg",
      cacheKey: "projects/p/files/x.jpg",
    });
    // expo-image wants cacheKey on source, NOT a top-level Image prop.
    expect(props).not.toHaveProperty("cacheKey");
  });

  it("falls back to the blurhash placeholder when no explicit placeholder is set", () => {
    captured.length = 0;
    render(
      <CachedImage
        source={{ uri: "https://example.com/x.jpg" }}
        blurhash="LEHV6nWB2yk8pyo0adR*.7kCMdnj"
      />,
    );
    expect(captured.at(-1)!.placeholder).toEqual({
      blurhash: "LEHV6nWB2yk8pyo0adR*.7kCMdnj",
    });
  });

  it("prefers an explicit placeholder over the blurhash", () => {
    captured.length = 0;
    render(
      <CachedImage
        source={{ uri: "https://example.com/x.jpg" }}
        placeholder={{ uri: "https://example.com/x.thumb.jpg" }}
        blurhash="LEHV6nWB2yk8pyo0adR*.7kCMdnj"
      />,
    );
    expect(captured.at(-1)!.placeholder).toEqual({
      uri: "https://example.com/x.thumb.jpg",
    });
  });

  it("omits placeholder when neither blurhash nor explicit placeholder are set", () => {
    captured.length = 0;
    render(<CachedImage source={{ uri: "https://example.com/x.jpg" }} />);
    expect(captured.at(-1)!.placeholder).toBeUndefined();
  });

  it("applies an aspect-ratio style when intrinsic dimensions are provided", () => {
    captured.length = 0;
    render(
      <CachedImage
        source={{ uri: "https://example.com/x.jpg" }}
        intrinsicWidth={4032}
        intrinsicHeight={3024}
      />,
    );
    const style = captured.at(-1)!.style as ReadonlyArray<Record<string, unknown>>;
    expect(Array.isArray(style)).toBe(true);
    expect(style[0]).toEqual({ aspectRatio: 4032 / 3024 });
  });
});
