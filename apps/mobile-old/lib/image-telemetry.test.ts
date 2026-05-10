import { afterEach, describe, expect, it, vi } from "vitest";
import {
  recordImageLoad,
  setImageLoadSink,
  type ImageLoadEvent,
} from "./image-telemetry";

describe("image-telemetry", () => {
  afterEach(() => {
    setImageLoadSink(() => {});
  });

  it("forwards events to the active sink", () => {
    const sink = vi.fn();
    setImageLoadSink(sink);
    const event: ImageLoadEvent = {
      cacheKey: "projects/p/files/f.jpg",
      durationMs: 120,
      sizeBytes: 50_000,
      source: "network",
    };
    recordImageLoad(event);
    expect(sink).toHaveBeenCalledWith(event);
  });

  it("swallows sink errors so telemetry never crashes the caller", () => {
    setImageLoadSink(() => {
      throw new Error("boom");
    });
    expect(() =>
      recordImageLoad({
        cacheKey: null,
        durationMs: 0,
        sizeBytes: null,
        source: "unknown",
      }),
    ).not.toThrow();
  });

  it("setImageLoadSink returns the previous sink for restoration", () => {
    const a = vi.fn();
    const b = vi.fn();
    const prev = setImageLoadSink(a);
    const restoredFromA = setImageLoadSink(b);
    expect(restoredFromA).toBe(a);
    setImageLoadSink(prev);
  });
});
