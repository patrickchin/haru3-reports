/**
 * Generate Report orchestration.
 *
 * Ported from `supabase/functions/generate-report/index.ts`. Composes:
 *   1. Provider/model resolution (`providers.ts`)
 *   2. Prompt construction
 *   3. LLM invocation (`llm.ts`)
 *   4. JSON extraction + Zod normalisation (`@harpa/report-core`)
 *   5. Optional token-usage recording
 */
import {
  normalizeGeneratedReportPayload,
  type GeneratedSiteReport,
} from "@harpa/report-core";

import {
  getModel,
  isValidProvider,
  type ProviderKey,
} from "./providers.js";
import {
  invokeTextModel,
  type GenerateTextFn,
  type RecordUsageParams,
  type TokenUsage,
  type UsageContext,
} from "./llm.js";

export const SYSTEM_PROMPT =
  `You are a construction site report assistant. You convert numbered voice notes from a construction site into a structured JSON report.

INPUT
- NOTES: numbered voice notes captured on site. Reference them via "sourceNoteIndexes": [n].

OUTPUT
Return ONLY valid minified JSON in this exact shape:
  { "report": { "meta": {...}, "weather": ..., "workers": ..., "materials": [...], "issues": [...], "nextSteps": [...], "sections": [...] } }

- Always return the FULL report. Include every top-level field, even when empty.
- Use null for missing "weather" / "workers", [] for empty arrays, "" for missing strings.
- Do NOT wrap the JSON in markdown fences. Do NOT add prose before or after.

SCHEMA
"meta":          { "title": str, "reportType": "site_visit|daily|inspection|safety|incident|progress", "summary": str, "visitDate": "YYYY-MM-DD"|null }
"weather":       { "conditions", "temperature", "wind", "impact" }              (object or null)
"workers":       { "totalWorkers": num, "workerHours", "notes",
                   "roles": [{ "role", "count": num, "notes" }] }                (object or null)
"materials":     [{ "name", "quantity", "quantityUnit", "condition", "status", "notes" }]
"issues":        [{ "title", "category", "severity", "status", "details", "actionRequired", "sourceNoteIndexes": [] }]
"nextSteps":     [str]
"sections":      [{ "title", "content": "markdown", "sourceNoteIndexes": [1, 2] }]

RULES
- Populate "meta.title" with a short, human-readable title (e.g. "Site Visit — Wet Weather") and "meta.summary" with a one-sentence overview.
- Use sections to capture work progress, observations, and narrative detail. Materials list everything mentioned (concrete, steel, timber, pipes, etc.) — do NOT extract cost/price information; that's handled outside this flow.
- NEVER invent data not in the notes. Keep strings concise. Deduplicate facts.

EXAMPLE
{ "report": { "meta": { "title": "Site Visit — Wet Weather", "reportType": "daily", "summary": "Wet conditions delayed concrete pour", "visitDate": null }, "weather": { "conditions": "wet", "temperature": "20C", "wind": null, "impact": "Pour delayed by 1 hour" }, "workers": null, "materials": [{ "name": "Concrete", "quantity": "50", "quantityUnit": "m³", "condition": null, "status": "delivered", "notes": null }], "issues": [], "nextSteps": ["Order rebar"], "sections": [{ "title": "Foundation Work", "content": "Concrete pour started in zone A despite wet weather.", "sourceNoteIndexes": [1, 2] }] } }`;

export class LLMParseError extends Error {
  constructor(
    public readonly rawText: string,
    cause: unknown,
  ) {
    super(
      `Failed to parse LLM response as JSON: ${
        cause instanceof Error ? cause.message : String(cause)
      }`,
    );
    this.name = "LLMParseError";
  }
}

export function isValidNotes(notes: unknown): notes is string[] {
  return (
    Array.isArray(notes) &&
    notes.length > 0 &&
    notes.every((note) => typeof note === "string")
  );
}

export function formatNotes(notes: string[], startIndex = 0): string {
  return notes.map((note, i) => `[${startIndex + i + 1}] ${note}`).join("\n");
}

function buildPrompt(notes: string[]): string {
  return `NOTES:\n${formatNotes(notes)}`;
}

export function extractJson(text: string): string {
  const stripped = text.trim();
  const codeBlockMatch = stripped.match(
    /^```(?:json)?\s*\n?([\s\S]*?)\n?```$/,
  );
  return codeBlockMatch ? codeBlockMatch[1]!.trim() : stripped;
}

export function parseLLMReport(text: string): GeneratedSiteReport {
  const json = extractJson(text);
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (err) {
    throw new LLMParseError(text, err);
  }
  const normalised = normalizeGeneratedReportPayload(parsed);
  if (!normalised) {
    throw new LLMParseError(text, new Error("payload failed schema validation"));
  }
  return normalised;
}

export interface GenerateReportDeps {
  readonly provider?: string;
  readonly model?: string;
  readonly generateTextFn?: GenerateTextFn;
  readonly getModelFn?: (
    provider: string,
    model?: string,
  ) => { instance: unknown; modelId: string };
  readonly usageContext?: UsageContext;
  readonly recordUsageFn?: (params: RecordUsageParams) => Promise<void>;
  readonly systemPromptOverride?: string;
}

export interface GenerateResult {
  readonly report: GeneratedSiteReport;
  readonly usage: TokenUsage | null;
  readonly provider: string;
  readonly model: string;
  readonly systemPrompt: string;
  readonly userPrompt: string;
}

export async function generateReport(
  notes: string[],
  deps: GenerateReportDeps = {},
): Promise<GenerateResult> {
  if (!isValidNotes(notes)) {
    throw new Error("notes must be a non-empty array of strings");
  }

  const requestedProvider = (
    deps.provider ?? process.env["AI_PROVIDER"] ?? "kimi"
  ).toLowerCase();
  if (!isValidProvider(requestedProvider)) {
    throw new Error(`Unknown provider: ${requestedProvider}`);
  }
  const provider: ProviderKey = requestedProvider;

  const resolveModel = deps.getModelFn ?? getModel;
  const resolved =
    deps.model !== undefined
      ? resolveModel(provider, deps.model)
      : resolveModel(provider);
  const systemPrompt = deps.systemPromptOverride ?? SYSTEM_PROMPT;
  const userPrompt = buildPrompt(notes);

  const { text, usage } = await invokeTextModel({
    provider,
    modelId: resolved.modelId,
    model: resolved.instance,
    system: systemPrompt,
    prompt: userPrompt,
    temperature: 0.2,
    ...(deps.generateTextFn !== undefined && {
      generateTextFn: deps.generateTextFn,
    }),
    ...(deps.usageContext !== undefined && { usageContext: deps.usageContext }),
    ...(deps.recordUsageFn !== undefined && {
      recordUsageFn: deps.recordUsageFn,
    }),
  });

  const report = parseLLMReport(text);
  return {
    report,
    usage,
    provider,
    model: resolved.modelId,
    systemPrompt,
    userPrompt,
  };
}
