import { describe, it, expect } from "vitest";
import { reportToHtml } from "./report-to-html";
import type { GeneratedSiteReport } from "./generated-report";
import {
  makeEquipment,
  makeManpower,
  makeMaterial,
} from "./report-test-fixtures";
import { writeFileSync } from "fs";
import { join } from "path";

const SAMPLE_REPORT: GeneratedSiteReport = {
  report: {
    meta: {
      title: "Commercial Build – Zone B Slab Pour & Precast Install",
      reportType: "daily",
      summary:
        "Productive day on site with 22 workers. Completed Zone B slab pour (32 MPa) and installed all 8 precast panels on Level 2 (5 north, 3 east). Plumbing rough-in 60% complete in Zone C. One near-miss incident recorded — dropped hammer from Level 2. Weather held despite early rain threat.",
      visitDate: "2025-03-15",
    },
    weather: {
      conditions: "Overcast, light rain mid-morning then clearing",
      temperature: "12°C",
      wind: "5-10 kph westerly, gusts to 35 kph in afternoon",
      impact: "Tarps prepared for pour; crane lifts paused briefly due to wind gusts",
    },
    manpower: makeManpower({
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
    siteConditions: [
      {
        topic: "Zone B Slab",
        details:
          "Freshly poured — no traffic for minimum 24 hours. Finishing crew completed trowel work by 3:30pm.",
      },
      {
        topic: "Zone C Access",
        details:
          "Cleared of stacked materials by mid-morning. Plumbing rough-in underway, expected complete by midday tomorrow.",
      },
      {
        topic: "Level 2 Edge Protection",
        details:
          "Inspected and confirmed compliant. Safety nets in place on south side. Harnesses worn by all personnel.",
      },
    ],
    activities: [
      {
        name: "Zone B Slab Pour",
        description: "32 MPa concrete slab pour for Zone B ground floor",
        location: "Zone B, Ground Floor",
        status: "completed",
        summary:
          "Pour started at 8:15am after formwork fix (minor bow at grid line 7). Two truck loads used. Engineer sign-off obtained prior. Building inspector attended and approved. Finishing complete by 3:30pm.",
        contractors: null,
        engineers: null,
        visitors: null,
        startDate: null,
        endDate: null,
        sourceNoteIndexes: [1, 5, 6, 7, 8, 14, 15, 22, 23, 33, 34, 35],
        manpower: makeManpower({
          totalWorkers: 6,
          workerHours: null,
          notes: "6 concreters plus pump truck operator",
          roles: [{ role: "Concreters", count: 6, notes: null }],
        }),
        materials: [
          makeMaterial({
            name: "Concrete 32 MPa",
            quantity: "2 truck loads",
            status: "delivered",
            notes: null,
          }),
        ],
        equipment: [
          makeEquipment({
            name: "Concrete Pump",
            quantity: "1",
            status: "operational",
            hoursUsed: "6",
            notes: null,
          }),
        ],
        issues: [],
        observations: [
          "Formwork bow at grid line 7 repaired in 15 minutes before pour",
          "Mix quality confirmed on site — correct 32 MPa spec",
        ],
      },
      {
        name: "Precast Panel Installation – Level 2",
        description:
          "Installation of 8 precast panels (5 north wall, 3 east wall)",
        location: "Level 2, North & East Walls",
        status: "completed",
        summary:
          "All 8 panels lifted and installed. North wall (5 panels) completed in morning. East wall (3 panels) completed in afternoon after brief wind delay. All panels plumb and secured.",
        contractors: null,
        engineers: null,
        visitors: null,
        startDate: null,
        endDate: null,
        sourceNoteIndexes: [10, 11, 12, 19, 29, 36, 43, 44, 45],
        manpower: null,
        materials: [
          makeMaterial({
            name: "Precast Panels (North)",
            quantity: "5",
            status: "installed",
            notes: null,
          }),
          makeMaterial({
            name: "Precast Panels (East)",
            quantity: "3",
            status: "installed",
            notes: null,
          }),
        ],
        equipment: [
          makeEquipment({
            name: "Tower Crane",
            quantity: "1",
            status: "operational",
            hoursUsed: "7",
            notes: "Minor hydraulic leak topped up — monitoring",
          }),
        ],
        issues: [],
        observations: [
          "Wind gusts to 35 kph caused brief pause in afternoon lifts",
          "All panels confirmed plumb after installation",
        ],
      },
      {
        name: "Electrical Conduit Runs – Zone A",
        description:
          "Conduit installation for ground floor electrical services",
        location: "Zone A, Ground Floor",
        status: "completed",
        summary:
          "All conduit runs completed in Zone A ground floor. Cable pulling scheduled for tomorrow.",
        contractors: null,
        engineers: null,
        visitors: null,
        startDate: null,
        endDate: null,
        sourceNoteIndexes: [3, 4, 13, 47],
        manpower: makeManpower({
          totalWorkers: 4,
          workerHours: null,
          notes: "Arrived 20 mins late due to traffic",
          roles: [{ role: "Electricians", count: 4, notes: null }],
        }),
        materials: [],
        equipment: [],
        issues: [],
        observations: [],
      },
      {
        name: "Plumbing Rough-In – Zone C",
        description: "Rough-in plumbing for Zone C",
        location: "Zone C",
        status: "in_progress",
        summary:
          "Zone cleared of materials by mid-morning. Plumbing crew started rough-in, approximately 60% complete. Expected to finish by midday tomorrow.",
        contractors: null,
        engineers: null,
        visitors: null,
        startDate: null,
        endDate: null,
        sourceNoteIndexes: [17, 18, 39, 48, 49],
        manpower: makeManpower({
          totalWorkers: 3,
          workerHours: null,
          notes: null,
          roles: [{ role: "Plumbers", count: 3, notes: "Richo's crew" }],
        }),
        materials: [],
        equipment: [],
        issues: [],
        observations: [],
      },
    ],
    issues: [
      {
        title: "Dropped Hammer – Near Miss",
        category: "safety",
        severity: "high",
        status: "resolved",
        details:
          "Apprentice Dylan dropped a hammer from Level 2. It struck the exclusion zone barricade below. No personnel were in the area.",
        actionRequired:
          "Incident report filed. All tools now require lanyards on Level 2+.",
        sourceNoteIndexes: [40, 41],
      },
      {
        title: "Crane Hydraulic Leak",
        category: "equipment",
        severity: "medium",
        status: "monitoring",
        details:
          "Minor hydraulic leak identified during pre-start checks on tower crane. Fluid topped up by operator. Crane functioned normally throughout the day.",
        actionRequired:
          "Monitor fluid levels at next pre-start. Schedule maintenance inspection if leak persists.",
        sourceNoteIndexes: [30],
      },
    ],
    nextSteps: [
      "No traffic on Zone B slab for minimum 24 hours (curing)",
      "Cable pulling in Zone A — electricians starting tomorrow morning",
      "Complete plumbing rough-in Zone C by midday tomorrow",
      "Order 12mm reo for next week's column pours — running low",
      "Book concrete pump for Thursday (Zone C slab)",
      "Monitor crane hydraulic fluid at tomorrow's pre-start",
      "Timber delivery tomorrow — 90×45 LVL for Level 2 formwork",
    ],
    sections: [],
    photoPlacements: [],
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
        manpower: null,
        siteConditions: [],
        activities: [],
        issues: [],
        nextSteps: [],
        sections: [],
        photoPlacements: [],
      },
    };
    const html = reportToHtml(xssReport);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
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
        manpower: null,
        siteConditions: [],
        activities: [],
        issues: [],
        nextSteps: [],
        sections: [],
        photoPlacements: [],
      },
    };
    const html = reportToHtml(minimal);
    expect(html).toContain("Minimal");
    expect(html).toContain("0");
  });

  it("writes preview file", () => {
    const html = reportToHtml(SAMPLE_REPORT, {
      companyName: "Haru Construction",
      accentColor: "#1a1a2e",
    });
    const outPath = join(__dirname, "../../../.preview-report.html");
    writeFileSync(outPath, html, "utf-8");
    console.log(
      `\n📄 Preview written to: ${outPath}\n   Open in browser to see the PDF layout.\n`
    );
  });
});
