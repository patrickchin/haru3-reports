import { describe, expect, it } from "vitest";
import { colors } from "./design-tokens/colors";
import { getSurfaceDepthStyle } from "./surface-depth";

describe("getSurfaceDepthStyle", () => {
  it("returns a flat surface with no visible shadow", () => {
    expect(getSurfaceDepthStyle("flat")).toEqual({
      shadowColor: colors.surface.shadow,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0,
      shadowRadius: 0,
      elevation: 0,
    });
  });

  it("returns a subtle raised surface by default", () => {
    expect(getSurfaceDepthStyle()).toEqual({
      shadowColor: colors.surface.shadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 8,
      elevation: 2,
    });
  });

  it("returns a slightly stronger floating surface for emphasized chrome", () => {
    expect(getSurfaceDepthStyle("floating")).toEqual({
      shadowColor: colors.surface.shadow,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.12,
      shadowRadius: 14,
      elevation: 4,
    });
  });
});
