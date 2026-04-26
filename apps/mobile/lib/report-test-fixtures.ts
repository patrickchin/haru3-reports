import type {
  GeneratedReportIssue,
  GeneratedReportWorkers,
  GeneratedReportMaterial,
} from "./generated-report";

export function makeWorkers(
  overrides: Partial<GeneratedReportWorkers> = {},
): GeneratedReportWorkers {
  return {
    totalWorkers: null,
    workerHours: null,
    notes: null,
    roles: [],
    ...overrides,
  };
}

export function makeMaterial(
  overrides: Partial<GeneratedReportMaterial> & Pick<GeneratedReportMaterial, "name">,
): GeneratedReportMaterial {
  const { name, ...rest } = overrides;

  return {
    name,
    quantity: null,
    quantityUnit: null,
    condition: null,
    status: null,
    notes: null,
    ...rest,
  };
}

export function makeIssue(
  overrides: Partial<GeneratedReportIssue> & Pick<GeneratedReportIssue, "title" | "details">,
): GeneratedReportIssue {
  const { title, details, ...rest } = overrides;

  return {
    title,
    category: "other",
    severity: "medium",
    status: "open",
    details,
    actionRequired: null,
    sourceNoteIndexes: [],
    ...rest,
  };
}
