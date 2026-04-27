import { describe, it, expect } from "vitest";

import { jsonDiff } from "./json-diff";

describe("jsonDiff", () => {
  it("returns no entries for equal values", () => {
    expect(jsonDiff({ a: 1 }, { a: 1 })).toEqual([]);
    expect(jsonDiff([1, 2], [1, 2])).toEqual([]);
    expect(jsonDiff(null, null)).toEqual([]);
  });

  it("detects scalar changes at root", () => {
    expect(jsonDiff(1, 2)).toEqual([
      { kind: "changed", path: "$", local: 1, server: 2 },
    ]);
  });

  it("detects nested changes", () => {
    expect(
      jsonDiff(
        { meta: { title: "A", summary: "x" } },
        { meta: { title: "B", summary: "x" } },
      ),
    ).toEqual([
      { kind: "changed", path: "meta.title", local: "A", server: "B" },
    ]);
  });

  it("detects added and removed object keys", () => {
    expect(jsonDiff({ a: 1 }, { a: 1, b: 2 })).toEqual([
      { kind: "added", path: "b", server: 2 },
    ]);
    expect(jsonDiff({ a: 1, b: 2 }, { a: 1 })).toEqual([
      { kind: "removed", path: "b", local: 2 },
    ]);
  });

  it("diffs arrays by index", () => {
    expect(jsonDiff([1, 2, 3], [1, 9])).toEqual([
      { kind: "changed", path: "[1]", local: 2, server: 9 },
      { kind: "removed", path: "[2]", local: 3 },
    ]);
    expect(jsonDiff([1], [1, 2, 3])).toEqual([
      { kind: "added", path: "[1]", server: 2 },
      { kind: "added", path: "[2]", server: 3 },
    ]);
  });

  it("handles type mismatches as changed at the path", () => {
    expect(jsonDiff({ a: 1 }, { a: [1] })).toEqual([
      { kind: "changed", path: "a", local: 1, server: [1] },
    ]);
  });
});
