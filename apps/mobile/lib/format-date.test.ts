import { describe, expect, it } from "vitest";
import { formatCapturedAt } from "./format-date";

describe("formatCapturedAt", () => {
  it("returns '' for null, undefined, and empty string", () => {
    expect(formatCapturedAt(null)).toBe("");
    expect(formatCapturedAt(undefined)).toBe("");
    expect(formatCapturedAt("")).toBe("");
  });

  it("returns '' for an unparseable string", () => {
    // Exercises the `Number.isNaN(d.getTime())` branch.
    expect(formatCapturedAt("not-a-date")).toBe("");
  });

  it("returns '' for NaN numeric inputs", () => {
    expect(formatCapturedAt(Number.NaN)).toBe("");
  });

  it("formats a valid ISO timestamp into a non-empty locale string", () => {
    const out = formatCapturedAt("2026-05-02T10:53:00Z");
    expect(out).not.toBe("");
    expect(out).toMatch(/2026/);
    // Locale-dependent — just verify the minute portion ("53") survives.
    expect(out).toMatch(/53/);
  });

  it("accepts numeric epoch-ms inputs", () => {
    // 2026-05-02T10:53:00.000Z = 1777805580000
    const out = formatCapturedAt(1777805580000);
    expect(out).not.toBe("");
    expect(out).toMatch(/2026/);
  });
});
