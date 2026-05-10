import { describe, it, expect } from "vitest";
import { reportToHtml } from "./report-to-html";
import type { GeneratedSiteReport } from "./generated-report";
import { makeWorkers, makeMaterial } from "./report-test-fixtures";
import { writeFileSync } from "fs";
import { join } from "path";

const SAMPLE_REPORT: GeneratedSiteReport = {
  report: {
    meta: {
      title: "Commercial Build – Zone B Slab Pour & Precast Install",
      reportType: "daily",
      summary:
        "Productive day on site with 22 workers. Completed Zone B slab pour (32 MPa) and installed all 8 precast panels on Level 2. Plumbing rough-in 60% complete in Zone C. One near-miss incident recorded — dropped hammer from Level 2.",
      visitDate: "2025-03-15",
    },
    weather: {
      conditions: "Overcast, light rain mid-morning then clearing",
      temperature: "12°C",
      wind: "5-10 kph westerly, gusts to 35 kph in afternoon",
      impact:
        "Tarps prepared for pour; crane lifts paused briefly due to wind gusts",
    },
    workers: makeWorkers({
      totalWorkers: 22,
      workerHours: "176 hrs (22 × 8hr day)",
      notes: "Full crew day. Electricians arrived 20 mins late (traffic).",
      roles: [
        { role: "Concreters", count: 6, notes: "Slab pour & finishing" },
        { role: "Electricians", count: 4, notes: "Conduit runs Zone A" },
        { role: "Plumbers", count: 3, notes: "Rough-in Zone C" },
        { role: "Crane Operator", count: 1, notes: "Precast lifts" },
        { role: "Carpenters", count: 4, notes: "Formwork & bracing" },
        { role: "Labourers", count: 4, notes: "General & zone clearing" },
      ],
    }),
    materials: [
      makeMaterial({
        name: "Concrete 32 MPa",
        quantity: "40",
        quantityUnit: "m³",
        status: "delivered",
      }),
      makeMaterial({
        name: "Precast Panels (North)",
        quantity: "5",
        status: "installed",
      }),
      makeMaterial({
        name: "Precast Panels (East)",
        quantity: "3",
        status: "installed",
      }),
    ],
    issues: [
      {
        title: "Dropped Hammer – Near Miss",
        category: "safety",
        severity: "high",
        status: "resolved",
        details:
          "Apprentice Dylan dropped a hammer from Level 2. It struck the exclusion zone barricade below.",
        actionRequired:
          "Incident report filed. All tools now require lanyards on Level 2+.",
        sourceNoteIndexes: [40, 41],
      },
    ],
    nextSteps: [
      "No traffic on Zone B slab for minimum 24 hours (curing)",
      "Cable pulling in Zone A — electricians starting tomorrow morning",
      "Complete plumbing rough-in Zone C by midday tomorrow",
    ],
    sections: [
      {
        title: "Zone B Slab Pour",
        content:
          "Pour started at 8:15am after formwork fix (minor bow at grid line 7). Two truck loads used. Engineer sign-off obtained prior. Finishing complete by 3:30pm.",
        sourceNoteIndexes: [1, 5, 6, 7, 8],
      },
      {
        title: "Precast Panel Installation – Level 2",
        content:
          "All 8 panels lifted and installed. North wall (5 panels) completed in morning. East wall (3 panels) completed in afternoon after brief wind delay.",
        sourceNoteIndexes: [10, 11, 12],
      },
    ],
  },
};

describe("reportToHtml", () => {
  it("generates valid HTML with all sections", () => {
    const html = reportToHtml(SAMPLE_REPORT, {
      companyName: "Haru Construction",
      accentColor: "#1a1a2e",
    });

    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("Commercial Build");
    expect(html).toContain("22");
    expect(html).toContain("Dropped Hammer");
    expect(html).toContain("Zone B Slab Pour");
    expect(html).toContain("Recommended Actions");
    expect(html).toContain("Haru Construction");
  });

  it("escapes HTML in content", () => {
    const xssReport: GeneratedSiteReport = {
      report: {
        meta: {
          title: '<script>alert("xss")</script>',
          reportType: "daily",
          summary: "Safe summary",
          visitDate: null,
        },
        weather: null,
        workers: null,
        materials: [],
        issues: [],
        nextSteps: [],
        sections: [],
      },
    };
    const html = reportToHtml(xssReport);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("escapes all special HTML characters including quotes and apostrophes", () => {
    const specialCharsReport: GeneratedSiteReport = {
      report: {
        meta: {
          title: 'Test & "quotes" <tag> \'apostrophe\'',
          reportType: "daily",
          summary: 'Summary with & < > " \' characters',
          visitDate: null,
        },
        weather: null,
        workers: null,
        materials: [],
        issues: [],
        nextSteps: [],
        sections: [
          {
            title: 'Section with <>&"\' chars',
            content: 'Content & more <html> "quotes" \'apostrophes\'',
            sourceNoteIndexes: [],
          },
        ],
      },
    };
    const html = reportToHtml(specialCharsReport);
    expect(html).toContain("&amp;");
    expect(html).toContain("&lt;");
    expect(html).toContain("&gt;");
    expect(html).toContain("&quot;");
    expect(html).not.toContain('<tag>');
  });

  it("handles empty arrays gracefully without rendering sections", () => {
    const emptyArraysReport: GeneratedSiteReport = {
      report: {
        meta: {
          title: "Report with Empty Sections",
          reportType: "daily",
          summary: "Has content",
          visitDate: null,
        },
        weather: null,
        workers: null,
        materials: [],
        issues: [],
        nextSteps: [],
        sections: [],
      },
    };
    const html = reportToHtml(emptyArraysReport);
    expect(html).toContain("Report with Empty Sections");
    expect(html).toContain("Has content");
    // Key Figures table will still show "Materials: 0" but no separate Materials section
    expect(html).not.toContain("Issues and Incidents");
    expect(html).not.toContain("Personnel Summary");
    expect(html).not.toContain("Recommended Actions");
  });

  it("renders all sections in correct order", () => {
    const html = reportToHtml(SAMPLE_REPORT, {
      companyName: "Haru Construction",
    });
    
    // Extract section headings in order they appear
    const headingMatches = html.match(/<h2>(\d+)\. ([^<]+)<\/h2>/g) || [];
    const headings = headingMatches.map(h => h.replace(/<\/?h2>/g, ''));
    
    // SAMPLE_REPORT has 2 additional sections, so 9 total
    expect(headings).toHaveLength(9);
    expect(headings[0]).toContain("1. Executive Summary");
    expect(headings[1]).toContain("2. Key Figures");
    expect(headings[2]).toContain("3. Weather Conditions");
    expect(headings[3]).toContain("4. Issues and Incidents");
    expect(headings[4]).toContain("5. Personnel Summary");
    expect(headings[5]).toContain("6. Materials");
    expect(headings[6]).toContain("7. Recommended Actions");
    expect(headings[7]).toContain("8. Zone B Slab Pour");
    expect(headings[8]).toContain("9. Precast Panel Installation");
  });

  it("handles minimal report without crashing", () => {
    const minimal: GeneratedSiteReport = {
      report: {
        meta: {
          title: "Minimal",
          reportType: "site_visit",
          summary: "Short",
          visitDate: null,
        },
        weather: null,
        workers: null,
        materials: [],
        issues: [],
        nextSteps: [],
        sections: [],
      },
    };
    const html = reportToHtml(minimal);
    expect(html).toContain("Minimal");
  });

  it("writes preview file", () => {
    const html = reportToHtml(SAMPLE_REPORT, {
      companyName: "Haru Construction",
      accentColor: "#1a1a2e",
    });
    const outPath = join(__dirname, "../../../.preview-report.html");
    writeFileSync(outPath, html, "utf-8");
    console.log(
      `\n📄 Preview written to: ${outPath}\n   Open in browser to see the PDF layout.\n`,
    );
  });
});
