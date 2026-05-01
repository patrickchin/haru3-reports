import { describe, expect, it } from "vitest";
import { computeAspectStyle } from "./image-aspect";

describe("computeAspectStyle", () => {
  it("returns aspectRatio for valid dimensions", () => {
    expect(computeAspectStyle(1600, 1200)).toEqual({ aspectRatio: 1600 / 1200 });
  });

  it("returns null when either dimension is missing or non-positive", () => {
    expect(computeAspectStyle(null, 100)).toBeNull();
    expect(computeAspectStyle(100, undefined)).toBeNull();
    expect(computeAspectStyle(0, 100)).toBeNull();
    expect(computeAspectStyle(100, -1)).toBeNull();
  });

  it("returns null for non-finite numbers", () => {
    expect(computeAspectStyle(Number.NaN, 100)).toBeNull();
    expect(computeAspectStyle(Number.POSITIVE_INFINITY, 100)).toBeNull();
  });
});
