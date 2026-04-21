import type {
  GeneratedSiteReport,
  GeneratedReportActivity,
  GeneratedReportIssue,
  GeneratedReportManpower,
  GeneratedReportMaterial,
  GeneratedReportEquipment,
  GeneratedReportWeather,
  GeneratedReportSiteCondition,
  GeneratedReportSection,
  GeneratedReportRole,
  GeneratedReportPhotoPlacement,
} from "./report-schema.ts";

type DeepPartialReport = {
  meta?: Partial<GeneratedSiteReport["report"]["meta"]>;
  weather?: Partial<GeneratedReportWeather> | null;
  manpower?: Partial<GeneratedReportManpower> | null;
  siteConditions?: Partial<GeneratedReportSiteCondition>[];
  activities?: Partial<GeneratedReportActivity>[];
  issues?: Partial<GeneratedReportIssue>[];
  nextSteps?: string[];
  sections?: Partial<GeneratedReportSection>[];
  photoPlacements?: GeneratedReportPhotoPlacement[];
};

function mergeNullableString(
  existing: string | null,
  patch: string | null | undefined,
): string | null {
  return patch !== undefined ? patch : existing;
}

function mergeNullableNumber(
  existing: number | null,
  patch: number | null | undefined,
): number | null {
  return patch !== undefined ? patch : existing;
}

function mergeRoles(
  existing: GeneratedReportRole[],
  patch: Partial<GeneratedReportRole>[] | undefined,
): GeneratedReportRole[] {
  if (!patch) {
    return existing;
  }

  const merged = [...existing];

  for (const patchRole of patch) {
    if (!patchRole.role) {
      continue;
    }

    const idx = merged.findIndex(
      (r) => r.role.toLowerCase() === patchRole.role!.toLowerCase(),
    );

    if (idx >= 0) {
      merged[idx] = {
        role: patchRole.role ?? merged[idx].role,
        count: mergeNullableNumber(merged[idx].count, patchRole.count),
        notes: mergeNullableString(merged[idx].notes, patchRole.notes),
      };
    } else {
      merged.push({
        role: patchRole.role,
        count: patchRole.count ?? null,
        notes: patchRole.notes ?? null,
      });
    }
  }

  return merged;
}

function mergeManpower(
  existing: GeneratedReportManpower | null,
  patch: Partial<GeneratedReportManpower> | null | undefined,
): GeneratedReportManpower | null {
  if (patch === undefined) {
    return existing;
  }

  if (patch === null) {
    return null;
  }

  const base: GeneratedReportManpower = existing ?? {
    totalWorkers: null,
    workerHours: null,
    workersCostPerDay: null,
    workersCostCurrency: null,
    notes: null,
    roles: [],
  };

  return {
    totalWorkers: mergeNullableNumber(base.totalWorkers, patch.totalWorkers),
    workerHours: mergeNullableString(base.workerHours, patch.workerHours),
    workersCostPerDay: mergeNullableString(base.workersCostPerDay, patch.workersCostPerDay),
    workersCostCurrency: mergeNullableString(base.workersCostCurrency, patch.workersCostCurrency),
    notes: mergeNullableString(base.notes, patch.notes),
    roles: mergeRoles(base.roles, patch.roles as Partial<GeneratedReportRole>[] | undefined),
  };
}

function mergeWeather(
  existing: GeneratedReportWeather | null,
  patch: Partial<GeneratedReportWeather> | null | undefined,
): GeneratedReportWeather | null {
  if (patch === undefined) {
    return existing;
  }

  if (patch === null) {
    return null;
  }

  const base: GeneratedReportWeather = existing ?? {
    conditions: null,
    temperature: null,
    wind: null,
    impact: null,
  };

  return {
    conditions: mergeNullableString(base.conditions, patch.conditions),
    temperature: mergeNullableString(base.temperature, patch.temperature),
    wind: mergeNullableString(base.wind, patch.wind),
    impact: mergeNullableString(base.impact, patch.impact),
  };
}

function mergeMaterials(
  existing: GeneratedReportMaterial[],
  patch: Partial<GeneratedReportMaterial>[] | undefined,
): GeneratedReportMaterial[] {
  if (!patch) {
    return existing;
  }

  const merged = [...existing];

  for (const patchItem of patch) {
    if (!patchItem.name) {
      continue;
    }

    const idx = merged.findIndex(
      (m) => m.name.toLowerCase() === patchItem.name!.toLowerCase(),
    );

    if (idx >= 0) {
      merged[idx] = {
        ...merged[idx],
        ...Object.fromEntries(
          Object.entries(patchItem).filter(([_, v]) => v !== undefined),
        ),
      } as GeneratedReportMaterial;
    } else {
      merged.push({
        name: patchItem.name,
        quantity: patchItem.quantity ?? null,
        quantityUnit: patchItem.quantityUnit ?? null,
        unitCost: patchItem.unitCost ?? null,
        unitCostCurrency: patchItem.unitCostCurrency ?? null,
        totalCost: patchItem.totalCost ?? null,
        totalCostCurrency: patchItem.totalCostCurrency ?? null,
        condition: patchItem.condition ?? null,
        status: patchItem.status ?? null,
        notes: patchItem.notes ?? null,
      });
    }
  }

  return merged;
}

function mergeEquipment(
  existing: GeneratedReportEquipment[],
  patch: Partial<GeneratedReportEquipment>[] | undefined,
): GeneratedReportEquipment[] {
  if (!patch) {
    return existing;
  }

  const merged = [...existing];

  for (const patchItem of patch) {
    if (!patchItem.name) {
      continue;
    }

    const idx = merged.findIndex(
      (e) => e.name.toLowerCase() === patchItem.name!.toLowerCase(),
    );

    if (idx >= 0) {
      merged[idx] = {
        ...merged[idx],
        ...Object.fromEntries(
          Object.entries(patchItem).filter(([_, v]) => v !== undefined),
        ),
      } as GeneratedReportEquipment;
    } else {
      merged.push({
        name: patchItem.name,
        quantity: patchItem.quantity ?? null,
        cost: patchItem.cost ?? null,
        costCurrency: patchItem.costCurrency ?? null,
        condition: patchItem.condition ?? null,
        ownership: patchItem.ownership ?? null,
        status: patchItem.status ?? null,
        hoursUsed: patchItem.hoursUsed ?? null,
        notes: patchItem.notes ?? null,
      });
    }
  }

  return merged;
}

function mergeIssues(
  existing: GeneratedReportIssue[],
  patch: Partial<GeneratedReportIssue>[] | undefined,
): GeneratedReportIssue[] {
  if (!patch) {
    return existing;
  }

  const merged = [...existing];

  for (const patchItem of patch) {
    if (!patchItem.title) {
      continue;
    }

    const idx = merged.findIndex(
      (i) => i.title.toLowerCase() === patchItem.title!.toLowerCase(),
    );

    if (idx >= 0) {
      merged[idx] = {
        ...merged[idx],
        ...Object.fromEntries(
          Object.entries(patchItem).filter(([_, v]) => v !== undefined),
        ),
      } as GeneratedReportIssue;
    } else {
      merged.push({
        title: patchItem.title,
        category: patchItem.category ?? "",
        severity: patchItem.severity ?? "medium",
        status: patchItem.status ?? "open",
        details: patchItem.details ?? "",
        actionRequired: patchItem.actionRequired ?? null,
        sourceNoteIndexes: patchItem.sourceNoteIndexes ?? [],
      });
    }
  }

  return merged;
}

function mergeActivities(
  existing: GeneratedReportActivity[],
  patch: Partial<GeneratedReportActivity>[] | undefined,
): GeneratedReportActivity[] {
  if (!patch) {
    return existing;
  }

  const merged = [...existing];

  for (const patchActivity of patch) {
    if (!patchActivity.name) {
      continue;
    }

    const idx = merged.findIndex(
      (a) => a.name.toLowerCase() === patchActivity.name!.toLowerCase(),
    );

    if (idx >= 0) {
      const base = merged[idx];
      merged[idx] = {
        name: patchActivity.name ?? base.name,
        description: mergeNullableString(base.description, patchActivity.description),
        location: mergeNullableString(base.location, patchActivity.location),
        status: patchActivity.status ?? base.status,
        summary: patchActivity.summary ?? base.summary,
        contractors: mergeNullableString(base.contractors, patchActivity.contractors),
        engineers: mergeNullableString(base.engineers, patchActivity.engineers),
        visitors: mergeNullableString(base.visitors, patchActivity.visitors),
        startDate: mergeNullableString(base.startDate, patchActivity.startDate),
        endDate: mergeNullableString(base.endDate, patchActivity.endDate),
        sourceNoteIndexes: deduplicateNumbers([
          ...base.sourceNoteIndexes,
          ...(patchActivity.sourceNoteIndexes ?? []),
        ]),
        manpower: mergeManpower(
          base.manpower,
          patchActivity.manpower as Partial<GeneratedReportManpower> | null | undefined,
        ),
        materials: mergeMaterials(
          base.materials,
          patchActivity.materials as Partial<GeneratedReportMaterial>[] | undefined,
        ),
        equipment: mergeEquipment(
          base.equipment,
          patchActivity.equipment as Partial<GeneratedReportEquipment>[] | undefined,
        ),
        issues: mergeIssues(
          base.issues,
          patchActivity.issues as Partial<GeneratedReportIssue>[] | undefined,
        ),
        observations: deduplicateStrings([
          ...base.observations,
          ...(patchActivity.observations ?? []),
        ]),
      };
    } else {
      merged.push({
        name: patchActivity.name,
        description: patchActivity.description ?? null,
        location: patchActivity.location ?? null,
        status: patchActivity.status ?? "reported",
        summary: patchActivity.summary ?? "",
        contractors: patchActivity.contractors ?? null,
        engineers: patchActivity.engineers ?? null,
        visitors: patchActivity.visitors ?? null,
        startDate: patchActivity.startDate ?? null,
        endDate: patchActivity.endDate ?? null,
        sourceNoteIndexes: patchActivity.sourceNoteIndexes ?? [],
        manpower: (patchActivity.manpower as GeneratedReportManpower) ?? null,
        materials: (patchActivity.materials as GeneratedReportMaterial[]) ?? [],
        equipment: (patchActivity.equipment as GeneratedReportEquipment[]) ?? [],
        issues: (patchActivity.issues as GeneratedReportIssue[]) ?? [],
        observations: patchActivity.observations ?? [],
      });
    }
  }

  return merged;
}

function mergeSiteConditions(
  existing: GeneratedReportSiteCondition[],
  patch: Partial<GeneratedReportSiteCondition>[] | undefined,
): GeneratedReportSiteCondition[] {
  if (!patch) {
    return existing;
  }

  const merged = [...existing];

  for (const patchItem of patch) {
    if (!patchItem.topic) {
      continue;
    }

    const idx = merged.findIndex(
      (c) => c.topic.toLowerCase() === patchItem.topic!.toLowerCase(),
    );

    if (idx >= 0) {
      merged[idx] = {
        topic: patchItem.topic ?? merged[idx].topic,
        details: patchItem.details ?? merged[idx].details,
      };
    } else {
      merged.push({
        topic: patchItem.topic,
        details: patchItem.details ?? "",
      });
    }
  }

  return merged;
}

function mergeSections(
  existing: GeneratedReportSection[],
  patch: Partial<GeneratedReportSection>[] | undefined,
): GeneratedReportSection[] {
  if (!patch) {
    return existing;
  }

  const merged = [...existing];

  for (const patchItem of patch) {
    if (!patchItem.title) {
      continue;
    }

    const idx = merged.findIndex(
      (s) => s.title.toLowerCase() === patchItem.title!.toLowerCase(),
    );

    if (idx >= 0) {
      merged[idx] = {
        title: patchItem.title ?? merged[idx].title,
        content: patchItem.content ?? merged[idx].content,
        sourceNoteIndexes: deduplicateNumbers([
          ...merged[idx].sourceNoteIndexes,
          ...(patchItem.sourceNoteIndexes ?? []),
        ]),
      };
    } else {
      merged.push({
        title: patchItem.title,
        content: patchItem.content ?? "",
        sourceNoteIndexes: patchItem.sourceNoteIndexes ?? [],
      });
    }
  }

  return merged;
}

function deduplicateStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const lower = value.toLowerCase().trim();
    if (lower && !seen.has(lower)) {
      seen.add(lower);
      result.push(value);
    }
  }

  return result;
}

function deduplicateNumbers(values: number[]): number[] {
  return [...new Set(values)].sort((a, b) => a - b);
}

// ── Removal types ─────────────────────────────────────────────

export type ReportRemove = {
  weather?: boolean;
  manpower?: boolean;
  siteConditions?: string[];  // topics
  activities?: string[];      // names
  issues?: string[];          // titles
  sections?: string[];        // titles
  nextSteps?: string[];       // exact strings
};

function removeByKey<T>(
  items: readonly T[],
  keys: readonly string[] | undefined,
  getKey: (item: T) => string,
): T[] {
  if (!keys || keys.length === 0) return [...items];
  const lowered = new Set(keys.map((k) => k.toLowerCase().trim()).filter(Boolean));
  if (lowered.size === 0) return [...items];
  return items.filter((item) => !lowered.has(getKey(item).toLowerCase().trim()));
}

function removeStrings(
  items: readonly string[],
  toRemove: readonly string[] | undefined,
): string[] {
  if (!toRemove || toRemove.length === 0) return [...items];
  const lowered = new Set(toRemove.map((k) => k.toLowerCase().trim()).filter(Boolean));
  if (lowered.size === 0) return [...items];
  return items.filter((item) => !lowered.has(item.toLowerCase().trim()));
}

export function applyReportPatch(
  existing: GeneratedSiteReport,
  patch: DeepPartialReport,
  remove?: ReportRemove,
): GeneratedSiteReport {
  const base = existing.report;

  // Step 1: apply patch (additions + updates)
  const patched = {
    meta: {
      title: patch.meta?.title ?? base.meta.title,
      reportType: patch.meta?.reportType ?? base.meta.reportType,
      summary: patch.meta?.summary ?? base.meta.summary,
      visitDate: mergeNullableString(base.meta.visitDate, patch.meta?.visitDate),
    },
    weather: mergeWeather(base.weather, patch.weather),
    manpower: mergeManpower(base.manpower, patch.manpower),
    siteConditions: mergeSiteConditions(base.siteConditions, patch.siteConditions),
    activities: mergeActivities(base.activities, patch.activities),
    issues: mergeIssues(base.issues, patch.issues),
    nextSteps: deduplicateStrings([
      ...base.nextSteps,
      ...(patch.nextSteps ?? []),
    ]),
    sections: mergeSections(base.sections, patch.sections),
    photoPlacements: patch.photoPlacements ?? base.photoPlacements,
  };

  // Step 2: apply removals
  if (!remove) {
    return { report: patched };
  }

  return {
    report: {
      ...patched,
      weather: remove.weather ? null : patched.weather,
      manpower: remove.manpower ? null : patched.manpower,
      siteConditions: removeByKey(patched.siteConditions, remove.siteConditions, (s) => s.topic),
      activities: removeByKey(patched.activities, remove.activities, (a) => a.name),
      issues: removeByKey(patched.issues, remove.issues, (i) => i.title),
      sections: removeByKey(patched.sections, remove.sections, (s) => s.title),
      nextSteps: removeStrings(patched.nextSteps, remove.nextSteps),
    },
  };
}

