import { describe, expect, it } from "vitest";
import type {
  GeneratedReportIssue,
  GeneratedReportSection,
  GeneratedSiteReport,
} from "./generated-report";
import {
  issueToText,
  issuesToText,
  nextStepsToText,
  reportToMarkdown,
  sectionToText,
  sectionsToText,
  summaryToText,
  weatherToText,
  workersToText,
  materialsToText,
} from "./report-to-text";

const baseSection: GeneratedReportSection = {
  title: "Site Conditions",
  content: "Foundations cured overnight.",
  sourceNoteIndexes: [],
};

const baseIssue: GeneratedReportIssue = {
  title: "Cracked tile near entrance",
  details: "Hairline crack in the second tile from the right.",
  severity: "warning",
  category: "quality",
  status: "open",
  actionRequired: "Replace tile before final inspection.",
  sourceNoteIndexes: [],
};

const baseReport: GeneratedSiteReport = {
  report: {
    meta: {
      title: "Daily Report — Highland Tower",
      reportType: "daily",
      visitDate: "2026-04-25",
      summary: "Crew installed drywall on level 3.",
    },
    weather: {
      conditions: "Sunny, 24°C",
      temperature: "24°C",
      wind: "Light NE 8 km/h",
      impact: "No delays.",
    },
    workers: {
      totalWorkers: 12,
      roles: [
        { role: "Electricians", count: 4, notes: null },
        { role: "Plumbers", count: 2, notes: null },
      ],
      workerHours: "8h",
      notes: "Crew rotated at noon.",
    },
    materials: [
      {
        name: "Drywall sheets",
        quantity: "40",
        quantityUnit: "sheets",
        status: "delivered",
        condition: "good",
        notes: "Stored in dry zone.",
      },
    ],
    issues: [baseIssue],
    nextSteps: ["Coordinate inspection", "Order grout"],
    sections: [baseSection],
  },
};

describe("summaryToText", () => {
  it("returns the trimmed summary", () => {
    expect(summaryToText(baseReport)).toBe(
      "Crew installed drywall on level 3.",
    );
  });

  it("returns an empty string when summary is missing", () => {
    const r: GeneratedSiteReport = {
      report: { ...baseReport.report, meta: { ...baseReport.report.meta, summary: undefined as unknown as string } },
    };
    expect(summaryToText(r)).toBe("");
  });
});

describe("issueToText", () => {
  it("formats a single issue with severity and action", () => {
    const text = issueToText(baseIssue);
    expect(text).toContain("Cracked tile near entrance [Warning]");
    expect(text).toContain("Quality · Open");
    expect(text).toContain("Hairline crack");
    expect(text).toContain("Action: Replace tile before final inspection.");
  });

  it("omits empty meta gracefully", () => {
    const text = issueToText({
      ...baseIssue,
      category: "",
      status: "",
      actionRequired: "",
    });
    expect(text).not.toContain("Action:");
    expect(text).not.toMatch(/·/);
  });
});

describe("issuesToText", () => {
  it("numbers each issue and indents continuation lines", () => {
    const text = issuesToText([baseIssue, baseIssue]);
    expect(text.startsWith("1. Cracked tile near entrance")).toBe(true);
    expect(text).toContain("2. Cracked tile near entrance");
    // Continuation lines are indented by 3 spaces so they group visually.
    expect(text).toMatch(/^   Quality · Open/m);
  });

  it("returns an empty string for no issues", () => {
    expect(issuesToText([])).toBe("");
  });
});

describe("nextStepsToText", () => {
  it("numbers steps starting at 1", () => {
    expect(nextStepsToText(["a", "b"])).toBe("1. a\n2. b");
  });

  it("returns an empty string when no steps", () => {
    expect(nextStepsToText([])).toBe("");
  });
});

describe("sectionToText / sectionsToText", () => {
  it("renders a section as a markdown heading", () => {
    expect(sectionToText(baseSection)).toBe(
      "## Site Conditions\n\nFoundations cured overnight.",
    );
  });

  it("joins multiple sections with blank lines", () => {
    const out = sectionsToText([baseSection, { ...baseSection, title: "Other" }]);
    expect(out).toContain("## Site Conditions");
    expect(out).toContain("## Other");
    // sections separated by a blank line
    expect(out.split("\n\n").length).toBeGreaterThanOrEqual(3);
  });
});

describe("materialsToText", () => {
  it("includes quantity, status, condition and notes", () => {
    const text = materialsToText(baseReport.report.materials);
    expect(text).toContain("- Drywall sheets (40 sheets · Delivered · Good)");
    expect(text).toContain("Stored in dry zone.");
  });

  it("returns empty string for no materials", () => {
    expect(materialsToText([])).toBe("");
  });
});

describe("workersToText", () => {
  it("lists totals, roles, hours and notes", () => {
    const text = workersToText(baseReport.report.workers);
    expect(text).toContain("Total on site: 12");
    expect(text).toContain("- Electricians: 4");
    expect(text).toContain("- Plumbers: 2");
    expect(text).toContain("Hours: 8h");
    expect(text).toContain("Crew rotated at noon.");
  });

  it("returns empty string when workers is null", () => {
    expect(workersToText(null)).toBe("");
  });
});

describe("weatherToText", () => {
  it("joins available fields and includes impact", () => {
    const text = weatherToText(baseReport);
    expect(text).toContain("Sunny");
    expect(text).toContain("24°C");
    expect(text).toContain("Light NE");
    expect(text).toContain("Impact: No delays.");
  });

  it("returns empty string when weather is missing", () => {
    const r: GeneratedSiteReport = {
      report: { ...baseReport.report, weather: null as unknown as GeneratedSiteReport["report"]["weather"] },
    };
    expect(weatherToText(r)).toBe("");
  });
});

describe("reportToMarkdown", () => {
  it("renders a full report with all major sections", () => {
    const md = reportToMarkdown(baseReport);
    expect(md.startsWith("# Daily Report — Highland Tower")).toBe(true);
    expect(md).toContain("## Summary");
    expect(md).toContain("Crew installed drywall on level 3.");
    expect(md).toContain("## Weather");
    expect(md).toContain("## Workers");
    expect(md).toContain("## Materials");
    expect(md).toContain("## Issues");
    expect(md).toContain("## Next Steps");
    expect(md).toContain("## Site Conditions");
    expect(md.endsWith("\n")).toBe(true);
  });

  it("skips empty sections gracefully", () => {
    const sparse: GeneratedSiteReport = {
      report: {
        meta: {
          title: "",
          reportType: "daily",
          visitDate: null as unknown as string,
          summary: "",
        },
        weather: null,
        workers: null,
        materials: [],
        issues: [],
        nextSteps: [],
        sections: [],
      },
    };
    const md = reportToMarkdown(sparse);
    expect(md.startsWith("# Untitled Report")).toBe(true);
    expect(md).not.toContain("## Summary");
    expect(md).not.toContain("## Weather");
    expect(md).not.toContain("## Workers");
    expect(md).not.toContain("## Materials");
    expect(md).not.toContain("## Issues");
    expect(md).not.toContain("## Next Steps");
  });
});
