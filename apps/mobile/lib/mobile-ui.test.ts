import { describe, expect, it } from "vitest";
import { getIssueSeverityTone, getReportStats } from "./mobile-ui";
import type { GeneratedSiteReport } from "./generated-report";
import { makeActivity, makeManpower } from "./report-test-fixtures";

const baseReport: GeneratedSiteReport = {
  report: {
    meta: {
      title: "Daily Progress Report",
      reportType: "daily",
      summary: "Summary",
      visitDate: "2026-04-20",
    },
    weather: null,
    manpower: null,
    activities: [],
    siteConditions: [],
    issues: [],
    nextSteps: [],
    sections: [],
    photoPlacements: [],
  },
};

describe("getIssueSeverityTone", () => {
  it("maps critical severities to danger", () => {
    expect(getIssueSeverityTone("high")).toBe("danger");
    expect(getIssueSeverityTone("critical")).toBe("danger");
  });

  it("maps medium severity to warning", () => {
    expect(getIssueSeverityTone("medium")).toBe("warning");
  });

  it("falls back to neutral for unknown values", () => {
    expect(getIssueSeverityTone("low")).toBe("neutral");
    expect(getIssueSeverityTone(undefined)).toBe("neutral");
  });
});

describe("getReportStats", () => {
  it("returns singular labels for single values", () => {
    const report: GeneratedSiteReport = {
      ...baseReport,
      report: {
        ...baseReport.report,
        manpower: makeManpower({
          totalWorkers: 1,
        }),
        activities: [
          makeActivity({
            name: "Column pour",
            summary: "Completed successfully",
            status: "completed",
            location: null,
          }),
        ],
        issues: [
          {
            title: "Rusty form tie",
            details: "Replace before next pour",
            severity: "medium",
            category: "equipment",
            status: "monitor",
            actionRequired: null,
            sourceNoteIndexes: [],
          },
        ],
      },
    };

    expect(getReportStats(report)).toEqual([
      { value: 1, label: "Worker", tone: "default" },
      { value: 1, label: "Activity", tone: "default" },
      { value: 1, label: "Issue", tone: "warning" },
    ]);
  });

  it("returns plural labels and zero defaults", () => {
    expect(getReportStats(baseReport)).toEqual([
      { value: 0, label: "Workers", tone: "default" },
      { value: 0, label: "Activities", tone: "default" },
      { value: 0, label: "Issues", tone: "default" },
    ]);
  });
});
