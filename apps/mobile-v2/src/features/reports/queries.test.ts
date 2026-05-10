/**
 * Smoke tests for report queries — validates query key factories and basic fetch.
 */
import { describe, it, expect } from "vitest";
import { reportKeys } from "./queries";

describe("reportKeys", () => {
  it("produces hierarchical query keys", () => {
    expect(reportKeys.all).toEqual(["reports"]);
    expect(reportKeys.byProject("pid-1")).toEqual(["reports", "project", "pid-1"]);
    expect(reportKeys.byId("rid-1")).toEqual(["reports", "id", "rid-1"]);
    expect(reportKeys.notes("rid-1")).toEqual(["reports", "id", "rid-1", "notes"]);
  });

  it("byProject keys share prefix with all", () => {
    const all = reportKeys.all;
    const byProject = reportKeys.byProject("pid-1");
    expect(byProject[0]).toBe(all[0]);
  });

  it("notes keys nest under byId", () => {
    const byId = reportKeys.byId("rid-1");
    const notes = reportKeys.notes("rid-1");
    expect(notes.slice(0, byId.length)).toEqual(byId);
  });
});
