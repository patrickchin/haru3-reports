import { describe, it, expect } from "vitest";
import { cn } from "./utils";

describe("cn", () => {
  it("joins multiple class names", () => {
    expect(cn("a", "b", "c")).toBe("a b c");
  });

  it("filters falsy values", () => {
    expect(cn("a", null, undefined, false, "", "b")).toBe("a b");
  });

  it("supports object form via clsx", () => {
    expect(cn({ a: true, b: false, c: true })).toBe("a c");
  });

  it("merges conflicting Tailwind classes via tailwind-merge (last wins)", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
    expect(cn("text-red-500", "text-blue-500")).toBe("text-blue-500");
  });

  it("preserves non-conflicting Tailwind classes", () => {
    expect(cn("p-2 m-2", "rounded")).toBe("p-2 m-2 rounded");
  });

  it("returns empty string with no args", () => {
    expect(cn()).toBe("");
  });

  it("flattens nested arrays", () => {
    expect(cn(["a", ["b", "c"]], "d")).toBe("a b c d");
  });
});
