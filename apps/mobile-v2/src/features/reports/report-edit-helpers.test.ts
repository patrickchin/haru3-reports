/**
 * Tests for report-edit-helpers — ported from v1.
 *
 * These tests validate the immutability contract: every helper returns a NEW
 * wrapper and a NEW report object. React shallow-equality must fire.
 */
import { describe, it, expect } from "vitest";
import {
  createEmptyReport,
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

describe("report-edit-helpers", () => {
  describe("createEmptyReport", () => {
    it("returns fresh empty report", () => {
      const r = createEmptyReport();
      expect(r.report.meta.title).toBe("");
      expect(r.report.meta.reportType).toBe("site_visit");
      expect(r.report.weather).toBeNull();
      expect(r.report.workers).toBeNull();
      expect(r.report.materials).toEqual([]);
    });
  });

  describe("updateMeta", () => {
    it("returns new wrapper and new report", () => {
      const r1 = createEmptyReport();
      const r2 = updateMeta(r1, { title: "New Title" });
      expect(r2).not.toBe(r1);
      expect(r2.report).not.toBe(r1.report);
      expect(r2.report.meta.title).toBe("New Title");
    });

    it("preserves other meta fields", () => {
      const r1 = updateMeta(createEmptyReport(), { title: "A", summary: "B" });
      const r2 = updateMeta(r1, { visitDate: "2026-05-10" });
      expect(r2.report.meta.title).toBe("A");
      expect(r2.report.meta.summary).toBe("B");
      expect(r2.report.meta.visitDate).toBe("2026-05-10");
    });
  });

  describe("updateWeather", () => {
    it("seeds empty weather on null base", () => {
      const r1 = createEmptyReport();
      const r2 = updateWeather(r1, { conditions: "Sunny" });
      expect(r2.report.weather?.conditions).toBe("Sunny");
      expect(r2.report.weather?.temperature).toBeNull();
    });

    it("clears weather when patch is null", () => {
      const r1 = updateWeather(createEmptyReport(), { conditions: "Rainy" });
      const r2 = updateWeather(r1, null);
      expect(r2.report.weather).toBeNull();
    });

    it("returns new objects", () => {
      const r1 = createEmptyReport();
      const r2 = updateWeather(r1, { conditions: "Cloudy" });
      expect(r2).not.toBe(r1);
      expect(r2.report).not.toBe(r1.report);
    });
  });

  describe("updateWorkers", () => {
    it("seeds empty workers on null base", () => {
      const r1 = createEmptyReport();
      const r2 = updateWorkers(r1, { totalWorkers: 10 });
      expect(r2.report.workers?.totalWorkers).toBe(10);
      expect(r2.report.workers?.roles).toEqual([]);
    });

    it("clears workers when patch is null", () => {
      const r1 = updateWorkers(createEmptyReport(), { totalWorkers: 5 });
      const r2 = updateWorkers(r1, null);
      expect(r2.report.workers).toBeNull();
    });
  });

  describe("setRoles", () => {
    it("replaces roles array", () => {
      const r1 = updateWorkers(createEmptyReport(), { totalWorkers: 10 });
      const r2 = setRoles(r1, [blankRole()]);
      expect(r2.report.workers?.roles.length).toBe(1);
    });

    it("preserves other workers fields", () => {
      const r1 = updateWorkers(createEmptyReport(), { totalWorkers: 10 });
      const r2 = setRoles(r1, []);
      expect(r2.report.workers?.totalWorkers).toBe(10);
    });
  });

  describe("setMaterials", () => {
    it("replaces materials array", () => {
      const r1 = createEmptyReport();
      const r2 = setMaterials(r1, [blankMaterial()]);
      expect(r2.report.materials.length).toBe(1);
    });

    it("returns new objects", () => {
      const r1 = createEmptyReport();
      const r2 = setMaterials(r1, []);
      expect(r2).not.toBe(r1);
      expect(r2.report).not.toBe(r1.report);
    });
  });

  describe("setIssues", () => {
    it("replaces issues array", () => {
      const r1 = createEmptyReport();
      const r2 = setIssues(r1, [blankIssue()]);
      expect(r2.report.issues.length).toBe(1);
    });
  });

  describe("setNextSteps", () => {
    it("replaces nextSteps array", () => {
      const r1 = createEmptyReport();
      const r2 = setNextSteps(r1, ["Step 1", "Step 2"]);
      expect(r2.report.nextSteps).toEqual(["Step 1", "Step 2"]);
    });
  });

  describe("setSections", () => {
    it("replaces sections array", () => {
      const r1 = createEmptyReport();
      const r2 = setSections(r1, [blankSection()]);
      expect(r2.report.sections.length).toBe(1);
    });
  });

  describe("factories", () => {
    it("blankRole returns valid empty role", () => {
      const role = blankRole();
      expect(role.role).toBe("");
      expect(role.count).toBeNull();
    });

    it("blankMaterial returns valid empty material", () => {
      const mat = blankMaterial();
      expect(mat.name).toBe("");
      expect(mat.quantity).toBeNull();
    });

    it("blankIssue returns valid empty issue", () => {
      const issue = blankIssue();
      expect(issue.title).toBe("");
      expect(issue.category).toBe("other");
      expect(issue.severity).toBe("medium");
    });

    it("blankSection returns valid empty section", () => {
      const section = blankSection();
      expect(section.title).toBe("");
      expect(section.content).toBe("");
    });
  });
});
