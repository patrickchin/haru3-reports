import { describe, expect, it } from "vitest";
import { fromTextArray, toTextArray, type NoteEntry } from "./note-entry";

describe("toTextArray", () => {
  it("extracts text from NoteEntry[]", () => {
    const entries: NoteEntry[] = [
      { text: "one", addedAt: 100 },
      { text: "two", addedAt: 200, source: "voice" },
      { text: "three", addedAt: 300, source: "text" },
    ];
    expect(toTextArray(entries)).toEqual(["one", "two", "three"]);
  });

  it("returns empty array for empty input", () => {
    expect(toTextArray([])).toEqual([]);
  });
});

describe("fromTextArray", () => {
  it("rebuilds NoteEntry[] with ascending synthetic timestamps", () => {
    const result = fromTextArray(["a", "b", "c"], 1000);
    expect(result).toEqual([
      { text: "a", addedAt: 1000, source: "text" },
      { text: "b", addedAt: 1001, source: "text" },
      { text: "c", addedAt: 1002, source: "text" },
    ]);
  });

  it("uses Date.now() as default base timestamp", () => {
    const before = Date.now();
    const result = fromTextArray(["x"]);
    const after = Date.now();
    expect(result[0].addedAt).toBeGreaterThanOrEqual(before);
    expect(result[0].addedAt).toBeLessThanOrEqual(after);
  });

  it("returns empty array for empty input", () => {
    expect(fromTextArray([])).toEqual([]);
  });

  it("preserves relative order via addedAt spacing", () => {
    const result = fromTextArray(["first", "second", "third"], 500);
    expect(result[0].addedAt).toBeLessThan(result[1].addedAt);
    expect(result[1].addedAt).toBeLessThan(result[2].addedAt);
  });
});
