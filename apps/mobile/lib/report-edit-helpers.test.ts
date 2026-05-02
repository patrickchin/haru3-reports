import { describe, expect, it } from "vitest";
import type { GeneratedSiteReport } from "./generated-report";
import {
  updateMeta,
  updateWeather,
  updateWorkers,
  setRoles,
  setMaterials,
  setIssues,
  setNextSteps,
  setSections,
  blankRole,
  blankMaterial,
  blankIssue,
  blankSection,
} from "./report-edit-helpers";

function makeReport(): GeneratedSiteReport {
  return {
    report: {
      meta: {
        title: "Daily site visit",
        reportType: "site_visit",
        summary: "All going well.",
        visitDate: "2026-04-30",
      },
      weather: {
        conditions: "Sunny",
        temperature: "22C",
        wind: null,
        impact: null,
      },
      workers: {
        totalWorkers: 4,
        workerHours: "8",
        notes: null,
        roles: [{ role: "Electrician", count: 2, notes: null }],
      },
      materials: [
        {
          name: "Cement",
          quantity: "10",
          quantityUnit: "bags",
          condition: null,
          status: "delivered",
          notes: null,
        },
      ],
      issues: [
        {
          title: "Leaky pipe",
          category: "plumbing",
          severity: "medium",
          status: "open",
          details: "Found in basement",
          actionRequired: null,
          sourceNoteIndexes: [],
        },
      ],
      nextSteps: ["Order more cement"],
      sections: [
        { title: "Progress", content: "Walls up.", sourceNoteIndexes: [] },
      ],
    },
    usage: undefined,
  };
}

describe("report-edit-helpers", () => {
  it("updateMeta returns new wrapper + new report + new meta and merges patch", () => {
    const r = makeReport();
    const out = updateMeta(r, { summary: "Updated summary" });
    expect(out).not.toBe(r);
    expect(out.report).not.toBe(r.report);
    expect(out.report.meta).not.toBe(r.report.meta);
    expect(out.report.meta.summary).toBe("Updated summary");
    expect(out.report.meta.title).toBe(r.report.meta.title);
    // other slices preserved by reference
    expect(out.report.workers).toBe(r.report.workers);
  });

  it("updateWeather merges patch into existing slice", () => {
    const r = makeReport();
    const out = updateWeather(r, { wind: "10 km/h" });
    expect(out.report.weather).not.toBe(r.report.weather);
    expect(out.report.weather?.wind).toBe("10 km/h");
    expect(out.report.weather?.conditions).toBe("Sunny");
  });

  it("updateWeather(null) clears the slice", () => {
    const r = makeReport();
    const out = updateWeather(r, null);
    expect(out).not.toBe(r);
    expect(out.report.weather).toBeNull();
  });

  it("updateWeather seeds empty shape when slice is null", () => {
    const r = makeReport();
    r.report.weather = null;
    const out = updateWeather(r, { conditions: "Rain" });
    expect(out.report.weather).toEqual({
      conditions: "Rain",
      temperature: null,
      wind: null,
      impact: null,
    });
  });

  it("updateWorkers seeds empty shape when slice is null", () => {
    const r = makeReport();
    r.report.workers = null;
    const out = updateWorkers(r, { totalWorkers: 3 });
    expect(out.report.workers).toEqual({
      totalWorkers: 3,
      workerHours: null,
      notes: null,
      roles: [],
    });
  });

  it("updateWorkers(null) clears the slice", () => {
    const r = makeReport();
    const out = updateWorkers(r, null);
    expect(out.report.workers).toBeNull();
  });

  it("setRoles replaces the roles array on workers", () => {
    const r = makeReport();
    const next = [blankRole()];
    const out = setRoles(r, next);
    expect(out.report.workers?.roles).toBe(next);
    expect(out.report.workers).not.toBe(r.report.workers);
  });

  it("setRoles seeds workers when null", () => {
    const r = makeReport();
    r.report.workers = null;
    const next = [{ role: "Foreman", count: 1, notes: null }];
    const out = setRoles(r, next);
    expect(out.report.workers?.roles).toBe(next);
    expect(out.report.workers?.totalWorkers).toBeNull();
  });

  it("setMaterials replaces the materials array", () => {
    const r = makeReport();
    const next = [blankMaterial()];
    const out = setMaterials(r, next);
    expect(out.report.materials).toBe(next);
    expect(out.report).not.toBe(r.report);
  });

  it("setIssues replaces the issues array", () => {
    const r = makeReport();
    const next = [blankIssue()];
    const out = setIssues(r, next);
    expect(out.report.issues).toBe(next);
  });

  it("setNextSteps replaces the next-steps array", () => {
    const r = makeReport();
    const out = setNextSteps(r, ["A", "B"]);
    expect(out.report.nextSteps).toEqual(["A", "B"]);
    expect(out.report).not.toBe(r.report);
  });

  it("setSections replaces the sections array", () => {
    const r = makeReport();
    const next = [blankSection()];
    const out = setSections(r, next);
    expect(out.report.sections).toBe(next);
  });

  it("blankRole/blankMaterial/blankIssue/blankSection produce expected empty shapes", () => {
    expect(blankRole()).toEqual({ role: "", count: null, notes: null });
    expect(blankMaterial()).toEqual({
      name: "",
      quantity: null,
      quantityUnit: null,
      condition: null,
      status: null,
      notes: null,
    });
    expect(blankIssue()).toEqual({
      title: "",
      category: "other",
      severity: "medium",
      status: "open",
      details: "",
      actionRequired: null,
      sourceNoteIndexes: [],
    });
    expect(blankSection()).toEqual({
      title: "",
      content: "",
      sourceNoteIndexes: [],
    });
  });

  it("each call produces a fresh factory object (no shared refs)", () => {
    expect(blankRole()).not.toBe(blankRole());
    expect(blankIssue().sourceNoteIndexes).not.toBe(
      blankIssue().sourceNoteIndexes,
    );
  });
});
