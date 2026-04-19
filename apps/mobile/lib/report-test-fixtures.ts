import type {
  GeneratedReportActivity,
  GeneratedReportEquipment,
  GeneratedReportIssue,
  GeneratedReportManpower,
  GeneratedReportMaterial,
} from "./generated-report";

export function makeManpower(
  overrides: Partial<GeneratedReportManpower> = {},
): GeneratedReportManpower {
  return {
    totalWorkers: null,
    workerHours: null,
    workersCostPerDay: null,
    workersCostCurrency: null,
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
    unitCost: null,
    unitCostCurrency: null,
    totalCost: null,
    totalCostCurrency: null,
    condition: null,
    status: null,
    notes: null,
    ...rest,
  };
}

export function makeEquipment(
  overrides: Partial<GeneratedReportEquipment> & Pick<GeneratedReportEquipment, "name">,
): GeneratedReportEquipment {
  const { name, ...rest } = overrides;

  return {
    name,
    quantity: null,
    cost: null,
    costCurrency: null,
    condition: null,
    ownership: null,
    status: null,
    hoursUsed: null,
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

export function makeActivity(
  overrides: Partial<GeneratedReportActivity> &
    Pick<GeneratedReportActivity, "name" | "summary">,
): GeneratedReportActivity {
  const { name, summary, ...rest } = overrides;

  return {
    name,
    description: null,
    location: null,
    status: "reported",
    summary,
    contractors: null,
    engineers: null,
    visitors: null,
    startDate: null,
    endDate: null,
    sourceNoteIndexes: [],
    manpower: null,
    materials: [],
    equipment: [],
    issues: [],
    observations: [],
    ...rest,
  };
}
