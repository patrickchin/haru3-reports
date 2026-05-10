/**
 * Pure immutable helpers for editing a `GeneratedSiteReport`.
 *
 * Ported from apps/mobile/lib/report-edit-helpers.ts.
 * Every helper returns a NEW wrapper object so React shallow-equality fires.
 *
 * Slice patches accept `Partial<...>` to merge; passing `null` for nullable
 * slices clears them. Whole-array setters replace the array. Factories produce
 * empty rows for "Add row" buttons.
 */

import type {
  GeneratedSiteReport,
  GeneratedReportWeather,
  GeneratedReportWorkers,
  GeneratedReportRole,
  GeneratedReportMaterial,
  GeneratedReportIssue,
  GeneratedReportSection,
} from "@harpa/report-core";

export type GeneratedReportMeta = GeneratedSiteReport["report"]["meta"];

export function createEmptyReport(): GeneratedSiteReport {
  return {
    report: {
      meta: {
        title: "",
        reportType: "site_visit",
        summary: "",
        visitDate: new Date().toLocaleDateString("en-CA"),
      },
      weather: null,
      workers: null,
      materials: [],
      issues: [],
      nextSteps: [],
      sections: [],
    },
  };
}

export function updateMeta(
  r: GeneratedSiteReport,
  patch: Partial<GeneratedReportMeta>
): GeneratedSiteReport {
  return {
    ...r,
    report: {
      ...r.report,
      meta: { ...r.report.meta, ...patch },
    },
  };
}

const EMPTY_WEATHER: GeneratedReportWeather = {
  conditions: null,
  temperature: null,
  wind: null,
  impact: null,
};

export function updateWeather(
  r: GeneratedSiteReport,
  patch: Partial<GeneratedReportWeather> | null
): GeneratedSiteReport {
  if (patch === null) {
    return { ...r, report: { ...r.report, weather: null } };
  }
  const base = r.report.weather ?? EMPTY_WEATHER;
  return {
    ...r,
    report: {
      ...r.report,
      weather: { ...base, ...patch },
    },
  };
}

const EMPTY_WORKERS: GeneratedReportWorkers = {
  totalWorkers: null,
  workerHours: null,
  notes: null,
  roles: [],
};

export function updateWorkers(
  r: GeneratedSiteReport,
  patch: Partial<GeneratedReportWorkers> | null
): GeneratedSiteReport {
  if (patch === null) {
    return { ...r, report: { ...r.report, workers: null } };
  }
  const base = r.report.workers ?? EMPTY_WORKERS;
  return {
    ...r,
    report: {
      ...r.report,
      workers: { ...base, ...patch },
    },
  };
}

export function setRoles(
  r: GeneratedSiteReport,
  roles: GeneratedReportRole[]
): GeneratedSiteReport {
  const base = r.report.workers ?? EMPTY_WORKERS;
  return {
    ...r,
    report: {
      ...r.report,
      workers: { ...base, roles },
    },
  };
}

export function setMaterials(
  r: GeneratedSiteReport,
  materials: GeneratedReportMaterial[]
): GeneratedSiteReport {
  return { ...r, report: { ...r.report, materials } };
}

export function setIssues(
  r: GeneratedSiteReport,
  issues: GeneratedReportIssue[]
): GeneratedSiteReport {
  return { ...r, report: { ...r.report, issues } };
}

export function setNextSteps(
  r: GeneratedSiteReport,
  steps: string[]
): GeneratedSiteReport {
  return { ...r, report: { ...r.report, nextSteps: steps } };
}

export function setSections(
  r: GeneratedSiteReport,
  sections: GeneratedReportSection[]
): GeneratedSiteReport {
  return { ...r, report: { ...r.report, sections } };
}

export function blankRole(): GeneratedReportRole {
  return { role: "", count: null, notes: null };
}

export function blankMaterial(): GeneratedReportMaterial {
  return {
    name: "",
    quantity: null,
    quantityUnit: null,
    condition: null,
    status: null,
    notes: null,
  };
}

export function blankIssue(): GeneratedReportIssue {
  return {
    title: "",
    category: "other",
    severity: "medium",
    status: "open",
    details: "",
    actionRequired: null,
    sourceNoteIndexes: [],
  };
}

export function blankSection(): GeneratedReportSection {
  return {
    title: "",
    content: "",
    sourceNoteIndexes: [],
  };
}
