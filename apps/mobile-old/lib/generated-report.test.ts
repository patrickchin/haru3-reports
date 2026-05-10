import { describe, it, expect } from "vitest";
import { normalizeGeneratedReportPayload } from "./generated-report";

describe("normalizeGeneratedReportPayload", () => {
  it("returns null for non-object input", () => {
    expect(normalizeGeneratedReportPayload(null)).toBeNull();
    expect(normalizeGeneratedReportPayload(undefined)).toBeNull();
    expect(normalizeGeneratedReportPayload("string")).toBeNull();
    expect(normalizeGeneratedReportPayload(42)).toBeNull();
    expect(normalizeGeneratedReportPayload([])).toBeNull();
  });

  it("returns null when report key is missing", () => {
    expect(normalizeGeneratedReportPayload({})).toBeNull();
    expect(normalizeGeneratedReportPayload({ data: {} })).toBeNull();
  });

  it("returns null when meta is missing or invalid", () => {
    expect(normalizeGeneratedReportPayload({ report: {} })).toBeNull();
    expect(
      normalizeGeneratedReportPayload({ report: { meta: "nope" } }),
    ).toBeNull();
  });

  it("accepts empty title and summary (LLM may return partial patch)", () => {
    const result = normalizeGeneratedReportPayload({
      report: {
        meta: { title: "", reportType: "daily", summary: "" },
      },
    });
    expect(result).not.toBeNull();
    expect(result!.report.meta.title).toBe("");
    expect(result!.report.meta.summary).toBe("");
  });

  it("normalizes a minimal valid report with defaults", () => {
    const result = normalizeGeneratedReportPayload({
      report: {
        meta: { title: "My Report", reportType: "daily", summary: "A summary" },
      },
    });
    expect(result).not.toBeNull();
    expect(result!.report.meta.title).toBe("My Report");
    expect(result!.report.meta.reportType).toBe("daily");
    expect(result!.report.meta.summary).toBe("A summary");
    expect(result!.report.meta.visitDate).toBeNull();
    expect(result!.report.weather).toBeNull();
    expect(result!.report.workers).toBeNull();
    expect(result!.report.materials).toEqual([]);
    expect(result!.report.issues).toEqual([]);
    expect(result!.report.nextSteps).toEqual([]);
    expect(result!.report.sections).toEqual([]);
  });

  it("defaults reportType to site_visit when empty string", () => {
    const result = normalizeGeneratedReportPayload({
      report: {
        meta: { title: "Title", reportType: "", summary: "Summary" },
      },
    });
    expect(result!.report.meta.reportType).toBe("site_visit");
  });

  it("trims string values in meta", () => {
    const result = normalizeGeneratedReportPayload({
      report: {
        meta: { title: "  Title  ", reportType: "  daily  ", summary: "  Summary  " },
      },
    });
    expect(result!.report.meta.title).toBe("Title");
    expect(result!.report.meta.reportType).toBe("daily");
    expect(result!.report.meta.summary).toBe("Summary");
  });

  it("normalizes weather data", () => {
    const result = normalizeGeneratedReportPayload({
      report: {
        meta: { title: "Title", reportType: "daily", summary: "Summary" },
        weather: {
          conditions: "Sunny",
          temperature: "25°C",
          wind: null,
          impact: null,
        },
      },
    });
    expect(result!.report.weather).toEqual({
      conditions: "Sunny",
      temperature: "25°C",
      wind: null,
      impact: null,
    });
  });

  it("normalizes workers with roles, skipping invalid roles", () => {
    const result = normalizeGeneratedReportPayload({
      report: {
        meta: { title: "Title", reportType: "daily", summary: "Summary" },
        workers: {
          totalWorkers: 10,
          workerHours: "80h",
          notes: "All hands on deck",
          roles: [
            { role: "Electricians", count: 4, notes: null },
            { role: "", count: 2, notes: null },
          ],
        },
      },
    });
    expect(result!.report.workers!.totalWorkers).toBe(10);
    expect(result!.report.workers!.roles).toHaveLength(1);
    expect(result!.report.workers!.roles[0].role).toBe("Electricians");
  });

  it("coerces numeric strings to numbers for totalWorkers and role count", () => {
    const result = normalizeGeneratedReportPayload({
      report: {
        meta: { title: "Title", reportType: "daily", summary: "Summary" },
        workers: {
          totalWorkers: "12",
          workerHours: null,
          notes: null,
          roles: [{ role: "Crew", count: "5", notes: null }],
        },
      },
    });
    expect(result!.report.workers!.totalWorkers).toBe(12);
    expect(result!.report.workers!.roles[0].count).toBe(5);
  });

  it("normalizes top-level materials, skipping ones without a name", () => {
    const result = normalizeGeneratedReportPayload({
      report: {
        meta: { title: "Title", reportType: "daily", summary: "Summary" },
        materials: [
          { name: "Concrete", quantity: "10", quantityUnit: "m³", status: "delivered" },
          { name: "", quantity: "5" },
        ],
      },
    });
    expect(result!.report.materials).toHaveLength(1);
    expect(result!.report.materials[0].name).toBe("Concrete");
    expect(result!.report.materials[0].quantityUnit).toBe("m³");
  });

  it("normalizes issues, applying defaults for missing fields", () => {
    const result = normalizeGeneratedReportPayload({
      report: {
        meta: { title: "Title", reportType: "daily", summary: "Summary" },
        issues: [
          {
            title: "Delay",
            details: "Late delivery",
            sourceNoteIndexes: [1, 2],
          },
        ],
      },
    });
    expect(result!.report.issues).toHaveLength(1);
    expect(result!.report.issues[0].category).toBe("other");
    expect(result!.report.issues[0].severity).toBe("medium");
    expect(result!.report.issues[0].status).toBe("open");
    expect(result!.report.issues[0].sourceNoteIndexes).toEqual([1, 2]);
  });

  it("normalizes nextSteps as string array, filtering empties and non-strings", () => {
    const result = normalizeGeneratedReportPayload({
      report: {
        meta: { title: "Title", reportType: "daily", summary: "Summary" },
        nextSteps: ["Step 1", "", 42, "Step 2"],
      },
    });
    expect(result!.report.nextSteps).toEqual(["Step 1", "Step 2"]);
  });

  it("normalizes sections, dropping ones with empty title or content", () => {
    const result = normalizeGeneratedReportPayload({
      report: {
        meta: { title: "Title", reportType: "daily", summary: "Summary" },
        sections: [
          { title: "Work Progress", content: "Foundation poured.", sourceNoteIndexes: [1] },
          { title: "", content: "Skipped" },
          { title: "No Content", content: "" },
        ],
      },
    });
    expect(result!.report.sections).toHaveLength(1);
    expect(result!.report.sections[0].title).toBe("Work Progress");
  });

  it("deduplicates and sorts sourceNoteIndexes", () => {
    const result = normalizeGeneratedReportPayload({
      report: {
        meta: { title: "Title", reportType: "daily", summary: "Summary" },
        sections: [
          {
            title: "Work",
            content: "Body",
            sourceNoteIndexes: [3, 1, 3, "2", 0, -1],
          },
        ],
      },
    });
    expect(result!.report.sections[0].sourceNoteIndexes).toEqual([1, 2, 3]);
  });

  it("handles a full realistic report", () => {
    const result = normalizeGeneratedReportPayload({
      report: {
        meta: {
          title: "Daily Site Report",
          reportType: "daily",
          summary: "Productive day with good weather. Concrete pour completed.",
          visitDate: "2026-04-15",
        },
        weather: {
          conditions: "Sunny",
          temperature: "22°C",
          wind: "Light",
          impact: null,
        },
        workers: {
          totalWorkers: 15,
          workerHours: "120h",
          notes: null,
          roles: [
            { role: "Concrete crew", count: 8, notes: "Zone A" },
            { role: "Labourers", count: 7, notes: null },
          ],
        },
        materials: [
          { name: "Concrete", quantity: "40", quantityUnit: "m³", status: "delivered" },
        ],
        issues: [
          {
            title: "Delayed rebar delivery",
            category: "schedule",
            severity: "medium",
            status: "open",
            details: "Rebar arrived 2 hours late.",
            actionRequired: "Follow up with supplier.",
            sourceNoteIndexes: [2],
          },
        ],
        nextSteps: ["Continue concrete pour Zone B", "Follow up rebar supplier"],
        sections: [
          { title: "Work Progress", content: "Concrete pour completed in Zone A.", sourceNoteIndexes: [1] },
        ],
      },
    });
    expect(result).not.toBeNull();
    expect(result!.report.meta.title).toBe("Daily Site Report");
    expect(result!.report.materials).toHaveLength(1);
    expect(result!.report.issues).toHaveLength(1);
    expect(result!.report.workers!.roles).toHaveLength(2);
    expect(result!.report.nextSteps).toHaveLength(2);
    expect(result!.report.sections).toHaveLength(1);
  });

  // ── LLM tolerance regressions ──────────────────────────────
  // These guard the "Unexpected response format" surface: the LLM is allowed
  // to emit numeric values and unknown keys, and the normalizer must still
  // succeed (coerce/strip) rather than reject the whole payload.

  it("coerces numeric quantity / quantityUnit on materials", () => {
    const result = normalizeGeneratedReportPayload({
      report: {
        meta: { title: "Title", reportType: "daily", summary: "Summary" },
        materials: [
          // LLM emitted bare numbers instead of strings.
          { name: "Concrete", quantity: 50, quantityUnit: "m³", status: "delivered" },
          { name: "Rebar", quantity: 2, quantityUnit: "tonnes" },
        ],
      },
    });
    expect(result).not.toBeNull();
    expect(result!.report.materials).toHaveLength(2);
    expect(result!.report.materials[0].quantity).toBe("50");
    expect(result!.report.materials[1].quantity).toBe("2");
  });

  it("coerces numeric weather / workerHours fields", () => {
    const result = normalizeGeneratedReportPayload({
      report: {
        meta: { title: "Title", reportType: "daily", summary: "Summary" },
        weather: {
          conditions: "Sunny",
          temperature: 24,
          wind: 12,
          impact: null,
        },
        workers: {
          totalWorkers: 10,
          workerHours: 80,
          notes: null,
          roles: [],
        },
      },
    });
    expect(result).not.toBeNull();
    expect(result!.report.weather!.temperature).toBe("24");
    expect(result!.report.weather!.wind).toBe("12");
    expect(result!.report.workers!.workerHours).toBe("80");
  });

  it("strips unknown keys instead of rejecting the payload", () => {
    const result = normalizeGeneratedReportPayload({
      report: {
        meta: {
          title: "Title",
          reportType: "daily",
          summary: "Summary",
          // Unknown meta key that the LLM might invent.
          location: "Austin, TX",
        },
        materials: [
          // Unknown extra key on a material.
          { name: "Concrete", quantity: "50", unit: "m³" },
        ],
        issues: [
          {
            title: "Missing toe-boards",
            details: "Scaffolding on north face",
            // Unknown key — common LLM hallucination.
            priority: "high",
            assignee: "site manager",
          },
        ],
        // Whole unknown top-level key under report.
        cost: { total: 1000 },
      },
    });
    expect(result).not.toBeNull();
    expect(result!.report.materials).toHaveLength(1);
    expect(result!.report.materials[0].name).toBe("Concrete");
    expect(result!.report.issues).toHaveLength(1);
    expect(result!.report.issues[0].title).toBe("Missing toe-boards");
    // Unknown keys must not appear on the parsed result.
    expect((result!.report.materials[0] as Record<string, unknown>).unit).toBeUndefined();
    expect((result!.report.issues[0] as Record<string, unknown>).priority).toBeUndefined();
    expect((result!.report.meta as Record<string, unknown>).location).toBeUndefined();
  });

  it("parses a realistic edge-function wire response (maestro flow)", () => {
    // Mirrors the shape returned by supabase/functions/generate-report's
    // handler for the typed note used in
    // apps/mobile/.maestro/report-create-and-delete.yaml. This is the exact
    // scenario behind the "Unexpected response format" failure: the LLM
    // tends to emit numeric quantities and the occasional extra key.
    const wirePayload = {
      report: {
        meta: {
          title: "Site Visit — 26 April",
          reportType: "site_visit",
          summary: "Sunny day; scaffolding issue raised.",
          visitDate: "2026-04-26",
        },
        weather: {
          conditions: "Sunny",
          temperature: 24,
          wind: "Light breeze",
          impact: null,
        },
        workers: {
          totalWorkers: 10,
          workerHours: 80,
          notes: null,
          roles: [
            { role: "Carpenters", count: 8, notes: null },
            { role: "Electricians", count: 2, notes: null },
          ],
        },
        materials: [
          {
            name: "N12 reinforcement bar",
            quantity: 2,
            quantityUnit: "tonnes",
            condition: "good",
            status: "delivered",
            notes: null,
          },
        ],
        issues: [
          {
            title: "Scaffolding missing toe-boards",
            category: "safety",
            severity: "medium",
            status: "open",
            details: "North face scaffolding has no toe-boards.",
            actionRequired: "Install before next pour.",
            sourceNoteIndexes: [1],
            // Unknown extra key from the LLM — must be stripped, not fatal.
            priority: "high",
          },
        ],
        nextSteps: ["Install toe-boards on north face"],
        sections: [
          {
            title: "Summary",
            content: "Productive site visit; one safety issue raised.",
            sourceNoteIndexes: [1],
          },
        ],
      },
      usage: { inputTokens: 100, outputTokens: 50 },
    };
    const result = normalizeGeneratedReportPayload(wirePayload);
    expect(result).not.toBeNull();
    expect(result!.report.materials[0].quantity).toBe("2");
    expect(result!.report.workers!.workerHours).toBe("80");
    expect(result!.report.issues).toHaveLength(1);
  });
});
