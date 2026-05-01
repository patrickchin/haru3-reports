import { describe, expect, it } from "vitest";
import {
  MAX_ORIGINAL_EDGE_PX,
  MAX_THUMBNAIL_EDGE_PX,
  planResize,
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
