import { z } from "zod";

// ── Zod primitives ─────────────────────────────────────────────

const trimmedString = z.string().transform((s) => s.trim());

const nonEmptyTrimmed = trimmedString.pipe(z.string().min(1));

const nullableTrimmed = z
  .union([z.string(), z.null()])
  .nullable()
  .optional()
  .transform((v) => (typeof v === "string" ? v.trim() || null : null));

const coercedNumber = z
  .union([z.number(), z.string()])
  .nullable()
  .optional()
  .transform((v) => {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() !== "") {
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    }
    return null;
  });

const sourceNoteIndexes = z
  .array(z.union([z.number(), z.string()]))
  .optional()
  .default([])
  .transform((arr) => {
    const set = new Set<number>();
    for (const entry of arr) {
      const n = typeof entry === "number" ? entry : Number(entry);
      if (Number.isInteger(n) && n > 0) set.add(n);
    }
    return [...set].sort((a, b) => a - b);
  });

const stringArray = z
  .array(z.unknown())
  .optional()
  .default([])
  .transform((arr) =>
    arr
      .map((v) => (typeof v === "string" ? v.trim() : ""))
      .filter(Boolean)
  );

// ── Schema definitions ─────────────────────────────────────────

const RoleSchema = z
  .object({ role: nonEmptyTrimmed, count: coercedNumber, notes: nullableTrimmed })
  .strict();

const WorkersSchema = z
  .object({
    totalWorkers: coercedNumber,
    workerHours: nullableTrimmed,
    notes: nullableTrimmed,
    roles: z.array(RoleSchema.catch(undefined as never)).default([]).transform((arr) => arr.filter(Boolean)),
  })
  .strict();

const MaterialSchema = z
  .object({
    name: nonEmptyTrimmed,
    quantity: nullableTrimmed,
    quantityUnit: nullableTrimmed,
    condition: nullableTrimmed,
    status: nullableTrimmed,
    notes: nullableTrimmed,
  })
  .strict();

const IssueSchema = z
  .object({
    title: nonEmptyTrimmed,
    category: trimmedString.pipe(z.string().min(1)).catch("other"),
    severity: trimmedString.pipe(z.string().min(1)).catch("medium"),
    status: trimmedString.pipe(z.string().min(1)).catch("open"),
    details: nonEmptyTrimmed,
    actionRequired: nullableTrimmed,
    sourceNoteIndexes,
  })
  .strict();

const SectionSchema = z
  .object({
    title: nonEmptyTrimmed,
    content: nonEmptyTrimmed,
    sourceNoteIndexes,
  })
  .strict();

const WeatherSchema = z
  .object({
    conditions: nullableTrimmed,
    temperature: nullableTrimmed,
    wind: nullableTrimmed,
    impact: nullableTrimmed,
  })
  .strict();

const GeneratedSiteReportSchema = z
  .object({
    report: z.object({
      meta: z.object({
        title: trimmedString,
        reportType: trimmedString.transform((s) => s || "site_visit"),
        summary: trimmedString,
        visitDate: nullableTrimmed,
      }).strict(),
      weather: WeatherSchema.nullable().optional().default(null).catch(null),
      workers: WorkersSchema.nullable().optional().default(null).catch(null),
      materials: z.array(MaterialSchema.catch(undefined as never)).default([]).transform((arr) => arr.filter(Boolean)),
      issues: z.array(IssueSchema.catch(undefined as never)).default([]).transform((arr) => arr.filter(Boolean)),
      nextSteps: stringArray,
      sections: z.array(SectionSchema.catch(undefined as never)).default([]).transform((arr) => arr.filter(Boolean)),
    }).strict(),
    usage: z.unknown().optional(),
  });

// ── Exported types (inferred from schemas) ─────────────────────

export type GeneratedReportSection = z.infer<typeof SectionSchema>;
export type GeneratedReportRole = z.infer<typeof RoleSchema>;
export type GeneratedReportWorkers = z.infer<typeof WorkersSchema>;
export type GeneratedReportMaterial = z.infer<typeof MaterialSchema>;
export type GeneratedReportIssue = z.infer<typeof IssueSchema>;
export type GeneratedReportWeather = z.infer<typeof WeatherSchema>;
export type GeneratedSiteReport = z.infer<typeof GeneratedSiteReportSchema>;

// ── Public API ─────────────────────────────────────────────────

export function normalizeGeneratedReportPayload(value: unknown): GeneratedSiteReport | null {
  const result = GeneratedSiteReportSchema.safeParse(value);
  return result.success ? result.data : null;
}
