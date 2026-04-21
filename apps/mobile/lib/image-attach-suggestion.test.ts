// Unit tests for the attach-suggestion priority chain.

import { describe, expect, it } from "vitest";
import { suggestAttachTarget } from "./image-attach-suggestion";
import type { GeneratedSiteReport } from "./generated-report";

function makeReport(overrides: Partial<GeneratedSiteReport["report"]> = {}): GeneratedSiteReport {
  return {
    report: {
      meta: { title: "t", reportType: "daily", summary: "", visitDate: null },
      weather: null,
      manpower: null,
      siteConditions: [],
      activities: [],
      issues: [],
      nextSteps: [],
      sections: [],
      photoPlacements: [],
      ...overrides,
    },
  };
}

describe("suggestAttachTarget", () => {
  it("returns none when report is null", () => {
    const s = suggestAttachTarget({
      report: null,
      photoId: "p1",
      precedingNoteIndex: null,
    });
    expect(s.source).toBe("none");
    expect(s.target).toBeNull();
  });

  it("prefers AI placement when available", () => {
    const report = makeReport({
      activities: [
        {
          name: "Foundation",
          description: null,
          location: null,
          status: "in_progress",
          summary: "s",
          contractors: null,
          engineers: null,
          visitors: null,
          startDate: null,
          endDate: null,
          sourceNoteIndexes: [1],
          manpower: null,
          materials: [],
          equipment: [],
          issues: [],
          observations: [],
        },
        {
          name: "Drainage",
          description: null,
          location: null,
          status: "in_progress",
          summary: "s",
          contractors: null,
          engineers: null,
          visitors: null,
          startDate: null,
          endDate: null,
          sourceNoteIndexes: [2],
          manpower: null,
          materials: [],
          equipment: [],
          issues: [],
          observations: [],
        },
      ],
      photoPlacements: [
        { photoId: "p1", linkedTo: "activity:1", reason: "crack described in note 2" },
      ],
    });

    const s = suggestAttachTarget({
      report,
      photoId: "p1",
      precedingNoteIndex: 1, // would otherwise point at activity 0
    });
    expect(s.source).toBe("ai");
    expect(s.target?.linkedTo).toBe("activity:1");
    expect(s.target?.label).toBe("Drainage");
  });

  it("falls back to preceding-note citation when no AI placement", () => {
    const report = makeReport({
      activities: [
        {
          name: "Foundation",
          description: null,
          location: null,
          status: "in_progress",
          summary: "s",
          contractors: null,
          engineers: null,
          visitors: null,
          startDate: null,
          endDate: null,
          sourceNoteIndexes: [1, 2],
          manpower: null,
          materials: [],
          equipment: [],
          issues: [],
          observations: [],
        },
        {
          name: "Drainage",
          description: null,
          location: null,
          status: "in_progress",
          summary: "s",
          contractors: null,
          engineers: null,
          visitors: null,
          startDate: null,
          endDate: null,
          sourceNoteIndexes: [3],
          manpower: null,
          materials: [],
          equipment: [],
          issues: [],
          observations: [],
        },
      ],
    });

    const s = suggestAttachTarget({
      report,
      photoId: "p1",
      precedingNoteIndex: 2,
    });
    expect(s.source).toBe("preceding-note");
    expect(s.target?.linkedTo).toBe("activity:0");
  });

  it("falls back to last activity when nothing else matches", () => {
    const report = makeReport({
      activities: [
        {
          name: "Foundation",
          description: null,
          location: null,
          status: "in_progress",
          summary: "s",
          contractors: null,
          engineers: null,
          visitors: null,
          startDate: null,
          endDate: null,
          sourceNoteIndexes: [1],
          manpower: null,
          materials: [],
          equipment: [],
          issues: [],
          observations: [],
        },
      ],
    });

    const s = suggestAttachTarget({
      report,
      photoId: "p1",
      precedingNoteIndex: null,
    });
    expect(s.source).toBe("last-activity");
    expect(s.target?.linkedTo).toBe("activity:0");
  });

  it("returns none when no activities at all", () => {
    const s = suggestAttachTarget({
      report: makeReport(),
      photoId: "p1",
      precedingNoteIndex: null,
    });
    expect(s.source).toBe("none");
    expect(s.target).toBeNull();
  });
});
