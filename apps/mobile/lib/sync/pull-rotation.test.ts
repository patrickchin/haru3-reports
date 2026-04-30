/**
 * Pull rotation coverage.
 *
 * Verifies the `PULLABLE_TABLES` array in `SyncProvider.tsx` includes
 * every exported `*_PULLABLE` descriptor and respects the FK ordering
 * invariant noted in that file's comment (parents before children).
 *
 * This is the test that would have caught the original bug where
 * `report_notes` had a descriptor + RPC + local schema, but was never
 * added to the rotation array — so transcripts only ever existed for
 * locally-created notes and never pulled to other devices.
 */
import { describe, expect, it } from "vitest";

import { PULLABLE_TABLES } from "./pullable-tables";
import {
  PROJECTS_PULLABLE,
  PROJECT_MEMBERS_PULLABLE,
  REPORTS_PULLABLE,
  FILE_METADATA_PULLABLE,
  REPORT_NOTES_PULLABLE,
} from "./pull-engine";

describe("PULLABLE_TABLES rotation", () => {
  const names = PULLABLE_TABLES.map((t) => t.name);

  it("includes every exported PullableTable descriptor", () => {
    const expected = [
      PROJECTS_PULLABLE.name,
      REPORTS_PULLABLE.name,
      PROJECT_MEMBERS_PULLABLE.name,
      FILE_METADATA_PULLABLE.name,
      REPORT_NOTES_PULLABLE.name,
    ].sort();
    expect([...names].sort()).toEqual(expected);
  });

  it("contains no duplicates", () => {
    expect(new Set(names).size).toBe(names.length);
  });

  it("orders FK parents before their children", () => {
    const idx = (n: string) => names.indexOf(n);
    // reports → projects (project_id FK)
    expect(idx("projects")).toBeLessThan(idx("reports"));
    // file_metadata → projects (project_id FK)
    expect(idx("projects")).toBeLessThan(idx("file_metadata"));
    // report_notes → reports, projects, file_metadata
    expect(idx("reports")).toBeLessThan(idx("report_notes"));
    expect(idx("projects")).toBeLessThan(idx("report_notes"));
    expect(idx("file_metadata")).toBeLessThan(idx("report_notes"));
  });
});
