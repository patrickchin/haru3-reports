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

function readRecord(
  value: unknown,
  label: string,
  options: { nullable?: boolean } = {},
): UnknownRecord | null {
  if (value == null && options.nullable) {
    return null;
  }

  if (!isRecord(value)) {
    throw new TypeError(`${label} must be an object${options.nullable ? " or null" : ""}`);
  }

  return value;
}

function readString(
  value: unknown,
  label: string,
  options: { nullable?: boolean; fallback?: string | null } = {},
): string | null {
  if (typeof value === "string") {
    return value.trim();
  }

  if (value == null && options.nullable) {
    return null;
  }

  if (options.fallback !== undefined) {
    return options.fallback;
  }

  throw new TypeError(`${label} must be a string${options.nullable ? " or null" : ""}`);
}

function readNumber(
  value: unknown,
  label: string,
  options: { nullable?: boolean; integer?: boolean } = {},
): number | null {
  if (value == null && options.nullable) {
    return null;
  }

  const parsed = typeof value === "number"
    ? value
    : typeof value === "string" && value.trim() !== ""
      ? Number(value)
      : Number.NaN;

  if (!Number.isFinite(parsed)) {
    throw new TypeError(`${label} must be a number${options.nullable ? " or null" : ""}`);
  }

  if (options.integer && !Number.isInteger(parsed)) {
    throw new TypeError(`${label} must be an integer`);
  }

  return parsed;
}

function readStringArray(value: unknown, label: string): string[] {
  if (value == null) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new TypeError(`${label} must be an array`);
  }

  return value.map((entry, index) => {
    if (typeof entry !== "string") {
      throw new TypeError(`${label}[${index}] must be a string`);
    }
    return entry.trim();
  }).filter(Boolean);
}

function readSourceNoteIndexes(value: unknown, label: string): number[] {
  if (value == null) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new TypeError(`${label} must be an array`);
  }

  const deduped = new Set<number>();

  for (const [index, entry] of value.entries()) {
    const parsed = typeof entry === "number"
      ? entry
      : typeof entry === "string" && entry.trim() !== ""
        ? Number(entry)
        : Number.NaN;

    if (!Number.isInteger(parsed) || parsed < 1) {
      throw new TypeError(`${label}[${index}] must be a positive integer`);
    }

    deduped.add(parsed);
  }

  return [...deduped].sort((a, b) => a - b);
}

function readArray<T>(
  value: unknown,
  label: string,
  parser: (entry: unknown, index: number) => T,
): T[] {
  if (value == null) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new TypeError(`${label} must be an array`);
  }

  return value.map(parser);
}

function parseRole(value: unknown, index: number): GeneratedReportRole {
  const role = readRecord(value, `report.manpower.roles[${index}]`);

  return {
    role: readString(role.role, `report.manpower.roles[${index}].role`) ?? "",
    count: role.count == null
      ? null
      : readNumber(role.count, `report.manpower.roles[${index}].count`, {
        nullable: true,
        integer: true,
      }),
    notes: readString(role.notes, `report.manpower.roles[${index}].notes`, {
      nullable: true,
      fallback: null,
    }),
  };
}

function parseManpower(
  value: unknown,
  label: string,
): GeneratedReportManpower | null {
  const manpower = readRecord(value, label, { nullable: true });

  if (manpower === null) {
    return null;
  }

  return {
    totalWorkers: manpower.totalWorkers == null
      ? null
      : readNumber(manpower.totalWorkers, `${label}.totalWorkers`, {
        nullable: true,
        integer: true,
      }),
    workerHours: readString(manpower.workerHours, `${label}.workerHours`, {
      nullable: true,
      fallback: null,
    }),
    notes: readString(manpower.notes, `${label}.notes`, {
      nullable: true,
      fallback: null,
    }),
    roles: readArray(manpower.roles, `${label}.roles`, parseRole),
  };
}

function parseMaterial(value: unknown, index: number): GeneratedReportMaterial {
  const material = readRecord(value, `report.activities[].materials[${index}]`);

  return {
    name: readString(material.name, `report.activities[].materials[${index}].name`) ?? "",
    quantity: readString(
      material.quantity,
      `report.activities[].materials[${index}].quantity`,
      { nullable: true, fallback: null },
    ),
    status: readString(
      material.status,
      `report.activities[].materials[${index}].status`,
      { nullable: true, fallback: null },
    ),
    notes: readString(
      material.notes,
      `report.activities[].materials[${index}].notes`,
      { nullable: true, fallback: null },
    ),
  };
}

function parseEquipment(value: unknown, index: number): GeneratedReportEquipment {
  const equipment = readRecord(value, `report.activities[].equipment[${index}]`);

  return {
    name: readString(equipment.name, `report.activities[].equipment[${index}].name`) ?? "",
    quantity: readString(
      equipment.quantity,
      `report.activities[].equipment[${index}].quantity`,
      { nullable: true, fallback: null },
    ),
    status: readString(
      equipment.status,
      `report.activities[].equipment[${index}].status`,
      { nullable: true, fallback: null },
    ),
    hoursUsed: readString(
      equipment.hoursUsed,
      `report.activities[].equipment[${index}].hoursUsed`,
      { nullable: true, fallback: null },
    ),
    notes: readString(
      equipment.notes,
      `report.activities[].equipment[${index}].notes`,
      { nullable: true, fallback: null },
    ),
  };
}

function parseIssue(value: unknown, index: number, label = "report.issues"): GeneratedReportIssue {
  const issue = readRecord(value, `${label}[${index}]`);

  return {
    title: readString(issue.title, `${label}[${index}].title`) ?? "",
    category: readString(issue.category, `${label}[${index}].category`) ?? "",
    severity: readString(issue.severity, `${label}[${index}].severity`) ?? "",
    status: readString(issue.status, `${label}[${index}].status`) ?? "",
    details: readString(issue.details, `${label}[${index}].details`) ?? "",
    actionRequired: readString(issue.actionRequired, `${label}[${index}].actionRequired`, {
      nullable: true,
      fallback: null,
    }),
    sourceNoteIndexes: readSourceNoteIndexes(
      issue.sourceNoteIndexes,
      `${label}[${index}].sourceNoteIndexes`,
    ),
  };
}

function parseActivity(value: unknown, index: number): GeneratedReportActivity {
  const activity = readRecord(value, `report.activities[${index}]`);

  return {
    name: readString(activity.name, `report.activities[${index}].name`) ?? "",
    location: readString(activity.location, `report.activities[${index}].location`, {
      nullable: true,
      fallback: null,
    }),
    status: readString(activity.status, `report.activities[${index}].status`) ?? "",
    summary: readString(activity.summary, `report.activities[${index}].summary`) ?? "",
    sourceNoteIndexes: readSourceNoteIndexes(
      activity.sourceNoteIndexes,
      `report.activities[${index}].sourceNoteIndexes`,
    ),
    manpower: parseManpower(activity.manpower, `report.activities[${index}].manpower`),
    materials: readArray(
      activity.materials,
      `report.activities[${index}].materials`,
      parseMaterial,
    ),
    equipment: readArray(
      activity.equipment,
      `report.activities[${index}].equipment`,
      parseEquipment,
    ),
    issues: readArray(
      activity.issues,
      `report.activities[${index}].issues`,
      (entry, issueIndex) =>
        parseIssue(entry, issueIndex, `report.activities[${index}].issues`),
    ),
    observations: readStringArray(
      activity.observations,
      `report.activities[${index}].observations`,
    ),
  };
}

function parseWeather(value: unknown): GeneratedReportWeather | null {
  const weather = readRecord(value, "report.weather", { nullable: true });

  if (weather === null) {
    return null;
  }

  return {
    conditions: readString(weather.conditions, "report.weather.conditions", {
      nullable: true,
      fallback: null,
    }),
    temperature: readString(weather.temperature, "report.weather.temperature", {
      nullable: true,
      fallback: null,
    }),
    wind: readString(weather.wind, "report.weather.wind", {
      nullable: true,
      fallback: null,
    }),
    impact: readString(weather.impact, "report.weather.impact", {
      nullable: true,
      fallback: null,
    }),
  };
}

function parseSiteCondition(value: unknown, index: number): GeneratedReportSiteCondition {
  const condition = readRecord(value, `report.siteConditions[${index}]`);

  return {
    topic: readString(condition.topic, `report.siteConditions[${index}].topic`) ?? "",
    details: readString(condition.details, `report.siteConditions[${index}].details`) ?? "",
  };
}

function parseSection(value: unknown, index: number): GeneratedReportSection {
  const section = readRecord(value, `report.sections[${index}]`);

  return {
    title: readString(section.title, `report.sections[${index}].title`) ?? "",
    content: readString(section.content, `report.sections[${index}].content`) ?? "",
    sourceNoteIndexes: readSourceNoteIndexes(
      section.sourceNoteIndexes,
      `report.sections[${index}].sourceNoteIndexes`,
    ),
  };
}

export function parseGeneratedSiteReport(value: unknown): GeneratedSiteReport {
  const root = readRecord(value, "response");
  const report = readRecord(root.report, "report");
  const meta = readRecord(report.meta, "report.meta");

  return {
    report: {
      meta: {
        title: readString(meta.title, "report.meta.title") ?? "",
        reportType: readString(meta.reportType, "report.meta.reportType") ?? "",
        summary: readString(meta.summary, "report.meta.summary") ?? "",
        visitDate: readString(meta.visitDate, "report.meta.visitDate", {
          nullable: true,
          fallback: null,
        }),
      },
      weather: parseWeather(report.weather),
      manpower: parseManpower(report.manpower, "report.manpower"),
      siteConditions: readArray(
        report.siteConditions,
        "report.siteConditions",
        parseSiteCondition,
      ),
      activities: readArray(report.activities, "report.activities", parseActivity),
      issues: readArray(report.issues, "report.issues", (entry, index) =>
        parseIssue(entry, index)
      ),
      nextSteps: readStringArray(report.nextSteps, "report.nextSteps"),
      sections: readArray(report.sections, "report.sections", parseSection),
    },
  };
}
