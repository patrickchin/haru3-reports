export type GeneratedReportSection = {
  title: string;
  content: string;
  sourceNoteIndexes: number[];
};

export type GeneratedReportRole = {
  role: string;
  count: number | null;
  notes: string | null;
};

export type GeneratedReportManpower = {
  totalWorkers: number | null;
  workerHours: string | null;
  notes: string | null;
  roles: GeneratedReportRole[];
};

export type GeneratedReportMaterial = {
  name: string;
  quantity: string | null;
  status: string | null;
  notes: string | null;
};

export type GeneratedReportEquipment = {
  name: string;
  quantity: string | null;
  status: string | null;
  hoursUsed: string | null;
  notes: string | null;
};

export type GeneratedReportIssue = {
  title: string;
  category: string;
  severity: string;
  status: string;
  details: string;
  actionRequired: string | null;
  sourceNoteIndexes: number[];
};

export type GeneratedReportActivity = {
  name: string;
  location: string | null;
  status: string;
  summary: string;
  sourceNoteIndexes: number[];
  manpower: GeneratedReportManpower | null;
  materials: GeneratedReportMaterial[];
  equipment: GeneratedReportEquipment[];
  issues: GeneratedReportIssue[];
  observations: string[];
};

export type GeneratedReportWeather = {
  conditions: string | null;
  temperature: string | null;
  wind: string | null;
  impact: string | null;
};

export type GeneratedReportSiteCondition = {
  topic: string;
  details: string;
};

export type GeneratedSiteReport = {
  report: {
    meta: {
      title: string;
      reportType: string;
      summary: string;
      visitDate: string | null;
    };
    weather: GeneratedReportWeather | null;
    manpower: GeneratedReportManpower | null;
    siteConditions: GeneratedReportSiteCondition[];
    activities: GeneratedReportActivity[];
    issues: GeneratedReportIssue[];
    nextSteps: string[];
    sections: GeneratedReportSection[];
  };
};

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function readNullableString(value: unknown): string | null {
  return typeof value === "string" ? value.trim() : null;
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter(Boolean);
}

function readSourceNoteIndexes(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const deduped = new Set<number>();

  for (const entry of value) {
    const parsed = typeof entry === "number"
      ? entry
      : typeof entry === "string" && entry.trim() !== ""
        ? Number(entry)
        : Number.NaN;

    if (Number.isInteger(parsed) && parsed > 0) {
      deduped.add(parsed);
    }
  }

  return [...deduped].sort((a, b) => a - b);
}

function normalizeRoles(value: unknown): GeneratedReportRole[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (!isRecord(entry)) {
      return [];
    }

    const role = readString(entry.role);
    if (!role) {
      return [];
    }

    return [{
      role,
      count: readNumber(entry.count),
      notes: readNullableString(entry.notes),
    }];
  });
}

function normalizeManpower(value: unknown): GeneratedReportManpower | null {
  if (!isRecord(value)) {
    return null;
  }

  return {
    totalWorkers: readNumber(value.totalWorkers),
    workerHours: readNullableString(value.workerHours),
    notes: readNullableString(value.notes),
    roles: normalizeRoles(value.roles),
  };
}

function normalizeMaterials(value: unknown): GeneratedReportMaterial[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (!isRecord(entry)) {
      return [];
    }

    const name = readString(entry.name);
    if (!name) {
      return [];
    }

    return [{
      name,
      quantity: readNullableString(entry.quantity),
      status: readNullableString(entry.status),
      notes: readNullableString(entry.notes),
    }];
  });
}

function normalizeEquipment(value: unknown): GeneratedReportEquipment[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (!isRecord(entry)) {
      return [];
    }

    const name = readString(entry.name);
    if (!name) {
      return [];
    }

    return [{
      name,
      quantity: readNullableString(entry.quantity),
      status: readNullableString(entry.status),
      hoursUsed: readNullableString(entry.hoursUsed),
      notes: readNullableString(entry.notes),
    }];
  });
}

function normalizeIssues(value: unknown): GeneratedReportIssue[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (!isRecord(entry)) {
      return [];
    }

    const title = readString(entry.title);
    const details = readString(entry.details);
    if (!title || !details) {
      return [];
    }

    return [{
      title,
      category: readString(entry.category, "other"),
      severity: readString(entry.severity, "medium"),
      status: readString(entry.status, "open"),
      details,
      actionRequired: readNullableString(entry.actionRequired),
      sourceNoteIndexes: readSourceNoteIndexes(entry.sourceNoteIndexes),
    }];
  });
}

function normalizeActivities(value: unknown): GeneratedReportActivity[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (!isRecord(entry)) {
      return [];
    }

    const name = readString(entry.name);
    const summary = readString(entry.summary);
    if (!name || !summary) {
      return [];
    }

    return [{
      name,
      location: readNullableString(entry.location),
      status: readString(entry.status, "reported"),
      summary,
      sourceNoteIndexes: readSourceNoteIndexes(entry.sourceNoteIndexes),
      manpower: normalizeManpower(entry.manpower),
      materials: normalizeMaterials(entry.materials),
      equipment: normalizeEquipment(entry.equipment),
      issues: normalizeIssues(entry.issues),
      observations: readStringArray(entry.observations),
    }];
  });
}

function normalizeSiteConditions(value: unknown): GeneratedReportSiteCondition[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (!isRecord(entry)) {
      return [];
    }

    const topic = readString(entry.topic);
    const details = readString(entry.details);
    if (!topic || !details) {
      return [];
    }

    return [{ topic, details }];
  });
}

function normalizeSections(value: unknown): GeneratedReportSection[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (!isRecord(entry)) {
      return [];
    }

    const title = readString(entry.title);
    const content = readString(entry.content);
    if (!title || !content) {
      return [];
    }

    return [{
      title,
      content,
      sourceNoteIndexes: readSourceNoteIndexes(entry.sourceNoteIndexes),
    }];
  });
}

function normalizeWeather(value: unknown): GeneratedReportWeather | null {
  if (!isRecord(value)) {
    return null;
  }

  return {
    conditions: readNullableString(value.conditions),
    temperature: readNullableString(value.temperature),
    wind: readNullableString(value.wind),
    impact: readNullableString(value.impact),
  };
}

function createLegacyReport(value: { section: string; content: string }[]): GeneratedSiteReport {
  return {
    report: {
      meta: {
        title: "Generated Site Report",
        reportType: "site_visit",
        summary: "Structured from field notes using the legacy section format.",
        visitDate: null,
      },
      weather: null,
      manpower: null,
      siteConditions: [],
      activities: [],
      issues: [],
      nextSteps: [],
      sections: value
        .filter((entry) => entry.section.trim() && entry.content.trim())
        .map((entry) => ({
          title: entry.section.trim(),
          content: entry.content.trim(),
          sourceNoteIndexes: [],
        })),
    },
  };
}

export function normalizeGeneratedReportPayload(value: unknown): GeneratedSiteReport | null {
  if (!isRecord(value)) {
    return null;
  }

  if (Array.isArray(value.report)) {
    const legacySections = value.report.flatMap((entry) => {
      if (!isRecord(entry)) {
        return [];
      }

      const section = readString(entry.section);
      const content = readString(entry.content);
      if (!section || !content) {
        return [];
      }

      return [{ section, content }];
    });

    return createLegacyReport(legacySections);
  }

  if (!isRecord(value.report) || !isRecord(value.report.meta)) {
    return null;
  }

  const meta = value.report.meta;
  const title = readString(meta.title);
  const reportType = readString(meta.reportType);
  const summary = readString(meta.summary);

  if (!title || !reportType || !summary) {
    return null;
  }

  return {
    report: {
      meta: {
        title,
        reportType,
        summary,
        visitDate: readNullableString(meta.visitDate),
      },
      weather: normalizeWeather(value.report.weather),
      manpower: normalizeManpower(value.report.manpower),
      siteConditions: normalizeSiteConditions(value.report.siteConditions),
      activities: normalizeActivities(value.report.activities),
      issues: normalizeIssues(value.report.issues),
      nextSteps: readStringArray(value.report.nextSteps),
      sections: normalizeSections(value.report.sections),
    },
  };
}
