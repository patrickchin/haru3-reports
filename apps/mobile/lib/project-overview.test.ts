import { describe, expect, it } from "vitest";
import type { ProjectReportListItem } from "./project-reports-list";
import {
  computeProjectOverviewStats,
  formatRelativeTime,
} from "./project-overview";

function makeReport(
  overrides: Partial<ProjectReportListItem> = {}
): ProjectReportListItem {
  return {
    id: "report-1",
    title: "",
    report_type: "daily",
    status: "final",
    visit_date: null,
    created_at: "2026-04-20T10:00:00.000Z",
    ...overrides,
  };
}

describe("computeProjectOverviewStats", () => {
  it("returns zeroed stats for an empty list", () => {
    expect(computeProjectOverviewStats([])).toEqual({
      totalReports: 0,
      draftReports: 0,
      finalReports: 0,
      lastReportAt: null,
    });
  });

  it("counts drafts vs final and picks the most recent date", () => {
    const reports: ProjectReportListItem[] = [
      makeReport({ id: "a", status: "draft", visit_date: "2026-04-10", created_at: "2026-04-10T00:00:00.000Z" }),
      makeReport({ id: "b", status: "final", visit_date: "2026-04-18", created_at: "2026-04-18T00:00:00.000Z" }),
      makeReport({ id: "c", status: "final", visit_date: null, created_at: "2026-04-19T09:30:00.000Z" }),
    ];

    expect(computeProjectOverviewStats(reports)).toEqual({
      totalReports: 3,
      draftReports: 1,
      finalReports: 2,
      lastReportAt: "2026-04-19T09:30:00.000Z",
    });
  });

  it("prefers visit_date when it is newer than created_at", () => {
    const reports = [
      makeReport({ id: "a", visit_date: "2026-04-21", created_at: "2026-04-10T00:00:00.000Z" }),
    ];
    expect(computeProjectOverviewStats(reports).lastReportAt).toBe("2026-04-21");
  });
});

describe("formatRelativeTime", () => {
  const now = new Date("2026-04-21T12:00:00.000Z");

  it("returns placeholder for null input", () => {
    expect(formatRelativeTime(null, now)).toBe("No reports yet");
  });

  it("returns placeholder for unparseable input", () => {
    expect(formatRelativeTime("not-a-date", now)).toBe("No reports yet");
  });

  it("returns 'Just now' for very recent times", () => {
    expect(formatRelativeTime("2026-04-21T11:59:30.000Z", now)).toBe("Just now");
  });

  it("formats minutes, hours, days, weeks, months, years", () => {
    expect(formatRelativeTime("2026-04-21T11:30:00.000Z", now)).toBe("30 minutes ago");
    expect(formatRelativeTime("2026-04-21T09:00:00.000Z", now)).toBe("3 hours ago");
    expect(formatRelativeTime("2026-04-19T12:00:00.000Z", now)).toBe("2 days ago");
    expect(formatRelativeTime("2026-04-10T12:00:00.000Z", now)).toBe("1 week ago");
    expect(formatRelativeTime("2026-02-01T12:00:00.000Z", now)).toBe("2 months ago");
    expect(formatRelativeTime("2024-04-21T12:00:00.000Z", now)).toBe("2 years ago");
  });

  it("handles singular values", () => {
    expect(formatRelativeTime("2026-04-21T11:59:00.000Z", now)).toBe("1 minute ago");
    expect(formatRelativeTime("2026-04-21T11:00:00.000Z", now)).toBe("1 hour ago");
    expect(formatRelativeTime("2026-04-20T12:00:00.000Z", now)).toBe("1 day ago");
  });
});
