import { describe, expect, it } from "vitest";
import {
  fromTextArray,
  noteRowsToPromptLines,
  toTextArray,
  type NoteEntry,
} from "./note-entry";

describe("toTextArray", () => {
  it("extracts text from NoteEntry[]", () => {
    const entries: NoteEntry[] = [
      { id: "n1", authorId: "u1", text: "one", addedAt: 100 },
      { id: "n2", authorId: "u2", text: "two", addedAt: 200, source: "voice" },
      { id: "n3", authorId: "u3", text: "three", addedAt: 300, source: "text" },
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

describe("noteRowsToPromptLines", () => {
  it("returns body verbatim for text and voice notes", () => {
    expect(
      noteRowsToPromptLines([
        { kind: "text", body: "hello" },
        { kind: "voice", body: "transcribed" },
      ]),
    ).toEqual(["hello", "transcribed"]);
  });
  it("returns empty string when text/voice body is null", () => {
    expect(
      noteRowsToPromptLines([
        { kind: "text", body: null },
        { kind: "voice", body: null },
      ]),
    ).toEqual(["", ""]);
  });
  it("numbers image/video/document placeholders independently per kind", () => {
    expect(
      noteRowsToPromptLines([
        { kind: "image", body: null },
        { kind: "text", body: "between" },
        { kind: "image", body: null },
        { kind: "video", body: null },
        { kind: "document", body: null },
        { kind: "image", body: null },
        { kind: "video", body: null },
        { kind: "document", body: null },
      ]),
    ).toEqual([
      "[image 1]",
      "between",
      "[image 2]",
      "[video 1]",
      "[document 1]",
      "[image 3]",
      "[video 2]",
      "[document 2]",
    ]);
  });
  it("ignores body on non-text kinds (placeholder is fixed)", () => {
    expect(
      noteRowsToPromptLines([
        { kind: "image", body: "irrelevant filename.jpg" },
      ]),
    ).toEqual(["[image 1]"]);
  });
  it("returns empty array for empty input", () => {
    expect(noteRowsToPromptLines([])).toEqual([]);
  });
});
