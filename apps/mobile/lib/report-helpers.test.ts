import { describe, it, expect } from "vitest";
import {
  toTitleCase,
  formatDate,
  formatSourceNotes,
  getWorkersLines,
  getWeatherLines,
  getIssueMeta,
  getItemMeta,
  getReportCompleteness,
} from "./report-helpers";
import type {
  GeneratedReportWorkers,
  GeneratedReportIssue,
  GeneratedSiteReport,
} from "./generated-report";
import { makeWorkers } from "./report-test-fixtures";

// ── toTitleCase ────────────────────────────────────────────────

describe("toTitleCase", () => {
  it("converts snake_case to Title Case", () => {
    expect(toTitleCase("in_progress")).toBe("In Progress");
  });

  it("converts kebab-case to Title Case", () => {
    expect(toTitleCase("on-hold")).toBe("On Hold");
  });

  it("handles single word", () => {
    expect(toTitleCase("completed")).toBe("Completed");
  });

  it("collapses multiple spaces", () => {
    expect(toTitleCase("hello    world")).toBe("Hello World");
  });

  it("trims whitespace", () => {
    expect(toTitleCase("  hello  ")).toBe("Hello");
  });

  it("handles empty string", () => {
    expect(toTitleCase("")).toBe("");
  });
});

// ── formatDate ─────────────────────────────────────────────────

describe("formatDate", () => {
  it("returns empty string for null", () => {
    expect(formatDate(null)).toBe("");
  });

  it("formats ISO date string", () => {
    const result = formatDate("2026-04-15T10:00:00Z");
    expect(result).toMatch(/Apr/);
    expect(result).toMatch(/15/);
    expect(result).toMatch(/2026/);
  });
});

// ── formatSourceNotes ──────────────────────────────────────────

describe("formatSourceNotes", () => {
  it("returns formatted string for non-empty indexes", () => {
    expect(formatSourceNotes([1, 3])).toBe("Source notes: 1, 3");
  });

  it("returns null for empty array", () => {
    expect(formatSourceNotes([])).toBeNull();
  });

  it("handles single index", () => {
    expect(formatSourceNotes([5])).toBe("Source notes: 5");
  });
});

// ── getWorkersLines ────────────────────────────────────────────

describe("getWorkersLines", () => {
  it("returns empty array for null", () => {
    expect(getWorkersLines(null)).toEqual([]);
  });

  it("includes total workers line", () => {
    const workers: GeneratedReportWorkers = makeWorkers({ totalWorkers: 12 });
    expect(getWorkersLines(workers)).toContain("12 workers recorded on site.");
  });

  it("includes worker hours", () => {
    const workers: GeneratedReportWorkers = makeWorkers({ workerHours: "96 hours" });
    expect(getWorkersLines(workers)).toContain("Worker hours: 96 hours");
  });

  it("includes notes", () => {
    const workers: GeneratedReportWorkers = makeWorkers({ notes: "Short staffed today" });
    expect(getWorkersLines(workers)).toContain("Short staffed today");
  });

  it("formats roles with count and notes", () => {
    const workers: GeneratedReportWorkers = makeWorkers({
      roles: [
        { role: "Electricians", count: 4, notes: "Level 2" },
        { role: "Labourers", count: null, notes: null },
      ],
    });
    const lines = getWorkersLines(workers);
    expect(lines).toContain("4 Electricians - Level 2");
    expect(lines).toContain("Labourers");
  });

  it("handles all fields populated", () => {
    const workers: GeneratedReportWorkers = makeWorkers({
      totalWorkers: 8,
      workerHours: "64 hours",
      notes: "Good progress",
      roles: [{ role: "Crew", count: 8, notes: null }],
    });
    expect(getWorkersLines(workers)).toHaveLength(4);
  });
});

// ── getWeatherLines ────────────────────────────────────────────

describe("getWeatherLines", () => {
  it("returns empty array when weather is null", () => {
    expect(getWeatherLines(makeReport({ weather: null }))).toEqual([]);
  });

  it("includes conditions", () => {
    const report = makeReport({
      weather: { conditions: "Sunny", temperature: null, wind: null, impact: null },
    });
    expect(getWeatherLines(report)).toEqual(["Sunny"]);
  });

  it("includes all weather fields", () => {
    const report = makeReport({
      weather: {
        conditions: "Overcast",
        temperature: "22°C",
        wind: "Light breeze",
        impact: "No impact on work",
      },
    });
    const lines = getWeatherLines(report);
    expect(lines).toEqual([
      "Overcast",
      "Temperature: 22°C",
      "Wind: Light breeze",
      "Impact: No impact on work",
    ]);
  });

  it("filters out null fields", () => {
    const report = makeReport({
      weather: {
        conditions: "Rain",
        temperature: null,
        wind: null,
        impact: "Delayed exterior work",
      },
    });
    expect(getWeatherLines(report)).toEqual([
      "Rain",
      "Impact: Delayed exterior work",
    ]);
  });
});

// ── getIssueMeta ───────────────────────────────────────────────

describe("getIssueMeta", () => {
  it("joins category, severity, and status", () => {
    const issue: GeneratedReportIssue = {
      title: "Test",
      category: "safety",
      severity: "high",
      status: "open",
      details: "Details",
      actionRequired: null,
      sourceNoteIndexes: [],
    };
    expect(getIssueMeta(issue)).toBe("Safety • High • Open");
  });

  it("filters out empty strings", () => {
    const issue: GeneratedReportIssue = {
      title: "Test",
      category: "",
      severity: "medium",
      status: "open",
      details: "Details",
      actionRequired: null,
      sourceNoteIndexes: [],
    };
    expect(getIssueMeta(issue)).toBe("Medium • Open");
  });
});

// ── getItemMeta ────────────────────────────────────────────────

describe("getItemMeta", () => {
  it("joins non-null values with bullet", () => {
    expect(getItemMeta(["A", "B", "C"])).toBe("A • B • C");
  });

  it("filters out null values", () => {
    expect(getItemMeta(["A", null, "C"])).toBe("A • C");
  });

  it("returns empty string for all nulls", () => {
    expect(getItemMeta([null, null])).toBe("");
  });
});

// ── getReportCompleteness ──────────────────────────────────────

describe("getReportCompleteness", () => {
  it("returns 0 for a completely empty report", () => {
    expect(getReportCompleteness(makeReport({}))).toBe(0);
  });

  it("returns 100 for a fully populated report", () => {
    const report = makeReport({
      meta: {
        title: "Full Report",
        reportType: "daily",
        summary: "A summary.",
        visitDate: "2026-04-15",
      },
      weather: { conditions: "Sunny", temperature: null, wind: null, impact: null },
      workers: makeWorkers({ totalWorkers: 10 }),
      materials: [
        {
          name: "Concrete",
          quantity: "10",
          quantityUnit: "m³",
          condition: null,
          status: "delivered",
          notes: null,
        },
      ],
      issues: [
        {
          title: "Delay",
          category: "schedule",
          severity: "medium",
          status: "open",
          details: "Rebar late",
          actionRequired: null,
          sourceNoteIndexes: [],
        },
      ],
      nextSteps: ["Continue"],
      sections: [
        { title: "Work", content: "Done.", sourceNoteIndexes: [] },
      ],
    });
    expect(getReportCompleteness(report)).toBe(100);
  });

  it("returns ~22% when only title and summary are filled (2/9 checks)", () => {
    const report = makeReport({
      meta: {
        title: "Partial",
        reportType: "daily",
        summary: "Some summary.",
        visitDate: null,
      },
    });
    expect(getReportCompleteness(report)).toBe(Math.round((2 / 9) * 100));
  });
});

// ── Test helpers ───────────────────────────────────────────────

function makeReport(
  overrides: Partial<GeneratedSiteReport["report"]> = {},
): GeneratedSiteReport {
  return {
    report: {
      meta: overrides.meta ?? {
        title: "",
        reportType: "",
        summary: "",
        visitDate: null,
      },
      weather: overrides.weather ?? null,
      workers: overrides.workers ?? null,
      materials: overrides.materials ?? [],
      issues: overrides.issues ?? [],
      nextSteps: overrides.nextSteps ?? [],
      sections: overrides.sections ?? [],
    },
  };
}
