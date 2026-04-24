import { describe, expect, it } from "vitest";
import {
  buildProjectReportsSections,
  getProjectReportMeta,
  getProjectReportsScreenTitle,
  getProjectReportTitle,
  type ProjectReportListItem,
} from "./project-reports-list";

const sampleReport: ProjectReportListItem = {
  id: "report-1",
  title: "",
  report_type: "daily",
  status: "draft",
  visit_date: "2026-04-20",
  created_at: "2026-04-20T10:00:00.000Z",
};

describe("buildProjectReportsSections", () => {
  it("groups reports into a single reports section for list rendering", () => {
    expect(buildProjectReportsSections([sampleReport])).toEqual([
      {
        key: "reports",
        title: "Reports",
        data: [sampleReport],
      },
    ]);
  });
});

describe("getProjectReportMeta", () => {
  it("builds a compact row meta label from the report type and visit date", () => {
    expect(getProjectReportMeta(sampleReport)).toBe("Daily • Apr 20, 2026");
  });

  it("falls back to created_at when the visit date is missing", () => {
    expect(
      getProjectReportMeta({
        ...sampleReport,
        visit_date: null,
      })
    ).toBe("Daily • Apr 20, 2026");
  });
});

describe("getProjectReportsScreenTitle", () => {
  it("shows the project name in the fixed screen header", () => {
    expect(getProjectReportsScreenTitle("Haru Tower")).toBe("Haru Tower");
  });

  it("falls back to a generic project label when the project name is blank", () => {
    expect(getProjectReportsScreenTitle("  ")).toBe("Project");
  });

  it("falls back to a generic project label when the project name is missing", () => {
    expect(getProjectReportsScreenTitle(null)).toBe("Project");
  });
});

describe("getProjectReportTitle", () => {
  it("uses a readable fallback title for untitled drafts", () => {
    expect(getProjectReportTitle(sampleReport)).toBe("Untitled Report");
  });
});
