import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import * as jose from "jsr:@panva/jose@6";
import { createOpenAICompatible } from "npm:@ai-sdk/openai-compatible";
import { createOpenAI } from "npm:@ai-sdk/openai";
import { createAnthropic } from "npm:@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "npm:@ai-sdk/google";
import type { GeneratedSiteReport } from "./report-schema.ts";
import { applyReportPatch } from "./apply-report-patch.ts";
import {
  type GenerateTextFn,
  invokeTextModel,
  type RecordUsageParams,
  type TokenUsage,
  type UsageContext,
} from "../_shared/llm.ts";
export type {
  RecordUsageParams,
  TokenUsage,
  UsageContext,
} from "../_shared/llm.ts";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

export const SYSTEM_PROMPT =
  `You are a construction site report assistant. You UPDATE a structured JSON report as new voice notes arrive.

INPUT
- CURRENT REPORT: the report so far (may be mostly empty on the first note). Treat it as the source of truth.
- NOTES: numbered voice notes. Reference them via "sourceNoteIndexes": [n].
  - ALL NOTES = every note from the start. Re-derive the report from scratch.
  - NEW NOTES = only notes that aren't yet reflected in CURRENT REPORT. Earlier notes are already incorporated — do NOT re-extract them.

OUTPUT
Return ONLY valid minified JSON in this exact shape:
  { "patch": { ...fields to change... }, "remove": { ...items to delete... } }
- "remove" is optional. Omit it when nothing is being deleted.
- Omit any field in "patch" that is unchanged. Do NOT emit null, "", or [] as "no change" — omit the key entirely.
- NEVER return the full report. NEVER wrap the output in a "report" key. Only emit keys that are being added, updated, or (via "remove") deleted.

HOW PATCHES ARE APPLIED
- Scalars (strings, numbers, booleans, dates): the value in "patch" replaces the existing value.
- Object fields (weather, manpower): provide a partial object; its fields merge into the existing object. Use null to clear the whole object.
- Arrays of objects (activities, issues, siteConditions, sections, materials, equipment, roles): items are matched by their identity key and MERGED (update in place) or APPENDED (new item).
    Identity keys:
      activities, materials, equipment, roles: "name"
      issues, sections: "title"
      siteConditions: "topic"
  To update an item, include its identity key plus ONLY the fields that change.
  To add an item, include its identity key and all known fields.
- String arrays (nextSteps, observations) and index arrays (sourceNoteIndexes): emit ONLY new entries; they are deduplicated-union-merged.

HOW DELETIONS WORK ("remove" block)
- For arrays of objects: { "activities": ["Old activity name"], "issues": ["Resolved issue title"] } — list the identity keys to delete.
- For string arrays: { "nextSteps": ["Step to drop"] } — list the exact strings.
- For nullable objects: { "weather": true } or { "manpower": true } — clears the field.
Only emit a "remove" block when the notes explicitly indicate removal (e.g. "cancel the excavator", "remove the concrete pour", "that issue is resolved, drop it"). Do NOT remove items just because a new note didn't mention them.

SCHEMA (shape of each field when you do emit it)
"meta":          { "title": str, "reportType": "site_visit|daily|inspection|safety|incident|progress", "summary": str, "visitDate": "YYYY-MM-DD"|null }
"weather":       { "conditions", "temperature", "wind", "impact" }                          (object, or null to clear)
"manpower":      { "totalWorkers": num, "workerHours", "workersCostPerDay", "workersCostCurrency", "notes",
                   "roles": [{ "role", "count": num, "notes" }] }                           (object, or null to clear)
"siteConditions":[{ "topic", "details" }]
"activities":    [{ "name", "description", "location", "status", "summary",
                    "contractors", "engineers", "visitors",
                    "startDate": "YYYY-MM-DD"|null, "endDate": "YYYY-MM-DD"|null,
                    "sourceNoteIndexes": [1, 2],
                    "manpower": <same shape as top-level>|null,
                    "materials": [{ "name", "quantity", "quantityUnit", "unitCost", "unitCostCurrency", "totalCost", "totalCostCurrency", "condition", "status", "notes" }],
                    "equipment": [{ "name", "quantity", "cost", "costCurrency", "condition", "ownership", "status", "hoursUsed", "notes" }],
                    "issues":    [{ "title", "category", "severity", "status", "details", "actionRequired", "sourceNoteIndexes": [] }],
                    "observations": [str] }]
"issues":        [ top-level issues, same shape as activity issues ]
"nextSteps":     [str]
"sections":      [{ "title", "content": "markdown", "sourceNoteIndexes": [1, 2] }]

RULES
- Materials and equipment belong INSIDE the relevant activity, not at the top level. Extract all of them mentioned (concrete, steel, timber, pipes, excavators, cranes, pumps, …).
- Activities are the backbone of the report.
- On the very first note, populate "meta.title" (short, human-readable, e.g. "Site Visit — Wet Weather") and "meta.summary". Once set, update them only when the notes justify a change.
- NEVER invent data not in the notes. Keep strings concise. Deduplicate facts.

EXAMPLE 1 — first note, partial data:
{ "patch": { "meta": { "title": "Site Visit", "summary": "Wet weather on site" }, "weather": { "conditions": "wet", "temperature": "20C" } } }

EXAMPLE 2 — update existing activity, add one, add next step:
{ "patch": { "activities": [ { "name": "Foundation Pour", "status": "completed" }, { "name": "Steel Delivery", "status": "in_progress", "sourceNoteIndexes": [5] } ], "nextSteps": ["Order rebar"] } }

EXAMPLE 3 — removal:
{ "patch": {}, "remove": { "activities": ["Excavator Mobilisation"], "nextSteps": ["Confirm crane booking"] } }`;


export const EMPTY_REPORT: GeneratedSiteReport = {
  report: {
    meta: { title: "", reportType: "site_visit", summary: "", visitDate: null },
    weather: null,
    manpower: null,
    siteConditions: [],
    activities: [],
    issues: [],
    nextSteps: [],
    sections: [],
    photoPlacements: [],
  },
};

export const VALID_PROVIDERS = [
  "kimi",
  "openai",
  "anthropic",
  "google",
] as const;

const PROVIDER_ENV_KEYS: Record<string, string> = {
  kimi: "MOONSHOT_API_KEY",
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  google: "GOOGLE_AI_API_KEY",
};

export function getAvailableProviders(): string[] {
  return VALID_PROVIDERS.filter((p) => !!Deno.env.get(PROVIDER_ENV_KEYS[p]));
}

export function getModel(provider: string) {
  switch (provider) {
    case "openai": {
      const key = Deno.env.get("OPENAI_API_KEY");
      if (!key) throw new Error("OPENAI_API_KEY not set");
      return {
        instance: createOpenAI({ apiKey: key })("gpt-4o-mini"),
        modelId: "gpt-4o-mini",
      };
    }
    case "anthropic": {
      const key = Deno.env.get("ANTHROPIC_API_KEY");
      if (!key) throw new Error("ANTHROPIC_API_KEY not set");
      return {
        instance: createAnthropic({ apiKey: key })("claude-sonnet-4-20250514"),
        modelId: "claude-sonnet-4-20250514",
      };
    }
    case "google": {
      const key = Deno.env.get("GOOGLE_AI_API_KEY");
      if (!key) throw new Error("GOOGLE_AI_API_KEY not set");
      return {
        instance: createGoogleGenerativeAI({ apiKey: key })("gemini-2.0-flash"),
        modelId: "gemini-2.0-flash",
      };
    }
    case "kimi":
    default: {
      const key = Deno.env.get("MOONSHOT_API_KEY");
      if (!key) throw new Error("MOONSHOT_API_KEY not set");
      return {
        instance: createOpenAICompatible({
          name: "kimi",
          baseURL: "https://api.moonshot.cn/v1",
          apiKey: key,
        })("kimi-k2-0711-preview"),
        modelId: "kimi-k2-0711-preview",
      };
    }
  }
}

export function isValidNotes(notes: unknown): notes is string[] {
  return Array.isArray(notes) && notes.length > 0 &&
    notes.every((note) => typeof note === "string");
}

export function formatNotes(notes: string[], startIndex = 0): string {
  return notes
    .map((note, i) => `[${startIndex + i + 1}] ${note}`)
    .join("\n");
}

export type LLMRawResult = {
  text: string;
  usage: TokenUsage | null;
  provider: string;
  model: string;
  base: GeneratedSiteReport;
};

export type GenerateResult = {
  report: GeneratedSiteReport;
  usage: TokenUsage | null;
  provider: string;
  model: string;
};

type GenerateReportDeps = {
  provider?: string;
  generateTextFn?: GenerateTextFn;
  getModelFn?: (provider: string) => unknown;
  getUserIdFn?: (req: Request) => Promise<string | null>;
  usageContext?: UsageContext;
  recordUsageFn?: (params: RecordUsageParams) => Promise<void>;
};

function compactReplacer(_key: string, value: unknown): unknown {
  if (value === null || value === "") return undefined;
  if (Array.isArray(value) && value.length === 0) return undefined;
  return value;
}

function buildPrompt(
  notes: string[],
  existingReport: GeneratedSiteReport,
  lastProcessedNoteCount?: number,
): string {
  const reportJson = JSON.stringify(existingReport, compactReplacer);

  const isIncremental = lastProcessedNoteCount !== undefined &&
    lastProcessedNoteCount > 0 &&
    lastProcessedNoteCount < notes.length;

  if (isIncremental) {
    const newNotes = notes.slice(lastProcessedNoteCount);
    return `CURRENT REPORT:
${reportJson}

Notes [1]\u2013[${lastProcessedNoteCount}] are already incorporated in the report above.

NEW NOTES (process only these):
${formatNotes(newNotes, lastProcessedNoteCount)}`;
  }

  return `CURRENT REPORT:
${reportJson}

ALL NOTES:
${formatNotes(notes)}`;
}

export class LLMParseError extends Error {
  constructor(public readonly rawText: string, cause: unknown) {
    super(
      `Failed to parse LLM response as JSON: ${
        cause instanceof Error ? cause.message : String(cause)
      }`,
    );
    this.name = "LLMParseError";
  }
}

export function extractJson(text: string): string {
  const stripped = text.trim();
  const codeBlockMatch = stripped.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/);
  return codeBlockMatch ? codeBlockMatch[1].trim() : stripped;
}

export async function fetchReportFromLLM(
  notes: string[],
  deps: GenerateReportDeps = {},
  existingReport?: GeneratedSiteReport | null,
  lastProcessedNoteCount?: number,
): Promise<LLMRawResult> {
  const provider = (
    deps.provider ?? Deno.env.get("AI_PROVIDER") ?? "kimi"
  ).toLowerCase();

  const resolved = (deps.getModelFn ?? getModel)(provider) as
    | { instance: unknown; modelId: string }
    | unknown;
  const model = typeof resolved === "object" &&
      resolved !== null &&
      "instance" in (resolved as Record<string, unknown>)
    ? (resolved as { instance: unknown; modelId: string }).instance
    : resolved;
  const modelId = typeof resolved === "object" &&
      resolved !== null &&
      "modelId" in (resolved as Record<string, unknown>)
    ? (resolved as { instance: unknown; modelId: string }).modelId
    : "unknown";

  const base = existingReport ?? EMPTY_REPORT;
  const prompt = buildPrompt(notes, base, lastProcessedNoteCount);

  const request = {
    model,
    system: SYSTEM_PROMPT,
    prompt,
    temperature: 0.3,
  };

  console.log("=== LLM INPUT ===");
  console.log("SYSTEM:\n" + request.system);
  console.log("\nUSER:\n" + request.prompt);
  console.log("=== END INPUT ===\n");

  const result = await invokeTextModel({
    provider,
    model: request.model,
    modelId,
    system: request.system,
    prompt: request.prompt,
    temperature: request.temperature,
    maxOutputTokens: 8000,
    providerOptions: {
      kimi: { response_format: { type: "json_object" } },
    },
    generateTextFn: deps.generateTextFn,
    usageContext: deps.usageContext,
    recordUsageFn: deps.recordUsageFn,
  });

  return { ...result, base };
}

export function parseAndApplyReport(raw: LLMRawResult): GenerateResult {
  const jsonText = extractJson(raw.text);
  try {
    const parsed = JSON.parse(jsonText);
    // Accept shapes: { patch, remove? } (preferred), or bare patch object (legacy).
    const hasPatchKey = parsed && typeof parsed === "object" && "patch" in parsed;
    const patchData = hasPatchKey ? (parsed.patch ?? {}) : parsed;
    const removeData = hasPatchKey && parsed.remove && typeof parsed.remove === "object"
      ? parsed.remove
      : undefined;
    return {
      report: applyReportPatch(raw.base, patchData, removeData),
      usage: raw.usage,
      provider: raw.provider,
      model: raw.model,
    };
  } catch (err) {
    throw new LLMParseError(raw.text, err);
  }
}

export async function generateReportFromNotes(
  notes: string[],
  deps: GenerateReportDeps = {},
  existingReport?: GeneratedSiteReport | null,
  lastProcessedNoteCount?: number,
): Promise<GenerateResult> {
  const raw = await fetchReportFromLLM(
    notes,
    deps,
    existingReport,
    lastProcessedNoteCount,
  );
  return parseAndApplyReport(raw);
}

function getBearerToken(req: Request): string | null {
  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return null;
  return authHeader.slice("Bearer ".length).trim() || null;
}

type VerifySupabaseJwtFn = (
  token: string,
  supabaseUrl: string,
) => Promise<jose.JWTPayload>;

async function verifySupabaseJwt(
  token: string,
  supabaseUrl: string,
): Promise<jose.JWTPayload> {
  const issuer = `${supabaseUrl}/auth/v1`;
  const jwks = jose.createRemoteJWKSet(
    new URL(`${issuer}/.well-known/jwks.json`),
  );
  const { payload } = await jose.jwtVerify(token, jwks, { issuer });
  return payload;
}

export async function resolveUserIdFromRequest(
  req: Request,
  deps: {
    verifySupabaseJwtFn?: VerifySupabaseJwtFn;
  } = {},
): Promise<string | null> {
  const token = getBearerToken(req);
  if (!token) return null;

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!supabaseUrl) {
    console.warn(
      "token_usage auth lookup skipped: missing SUPABASE_URL",
    );
    return null;
  }

  try {
    const payload = await (deps.verifySupabaseJwtFn ?? verifySupabaseJwt)(
      token,
      supabaseUrl,
    );
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("token_usage auth lookup failed:", message);
    return null;
  }
}

async function defaultGetUserId(req: Request): Promise<string | null> {
  return resolveUserIdFromRequest(req);
}

export function createHandler(deps: GenerateReportDeps = {}) {
  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }

    if (req.method === "GET") {
      const available = getAvailableProviders();
      return new Response(JSON.stringify({ providers: available }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    try {
      // Extract user from JWT for usage tracking
      const getUserId = deps.getUserIdFn ?? defaultGetUserId;
      const userId = await getUserId(req);

      const body = (await req.json()) as {
        notes?: unknown;
        existingReport?: unknown;
        lastProcessedNoteCount?: unknown;
        provider?: unknown;
        projectId?: unknown;
      };
      const { notes } = body;

      if (!isValidNotes(notes)) {
        return new Response(
          JSON.stringify({
            error: "notes must be a non-empty array of strings",
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      const raw = body.existingReport;
      const existingReport = typeof raw === "object" &&
          raw !== null &&
          typeof (raw as Record<string, unknown>).report === "object"
        ? (raw as GeneratedSiteReport)
        : null;

      const lastProcessedNoteCount =
        typeof body.lastProcessedNoteCount === "number" &&
          Number.isInteger(body.lastProcessedNoteCount) &&
          body.lastProcessedNoteCount >= 0
          ? body.lastProcessedNoteCount
          : undefined;

      const requestProvider = typeof body.provider === "string" &&
          VALID_PROVIDERS.includes(
            body.provider.toLowerCase() as typeof VALID_PROVIDERS[number],
          )
        ? body.provider.toLowerCase()
        : undefined;

      const projectId =
        typeof body.projectId === "string" && body.projectId.length > 0
          ? body.projectId
          : null;

      const effectiveDeps: GenerateReportDeps = {
        ...deps,
        usageContext: {
          userId,
          projectId,
        },
      };

      if (requestProvider) {
        effectiveDeps.provider = requestProvider;
      }

      // Step 1: Fetch from LLM and record usage in the shared wrapper
      const llmResult = await fetchReportFromLLM(
        notes,
        effectiveDeps,
        existingReport,
        lastProcessedNoteCount,
      );

      // Step 2: Parse and apply the report
      const result = parseAndApplyReport(llmResult);

      return new Response(
        JSON.stringify({
          report: result.report.report,
          usage: result.usage,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    } catch (err) {
      if (err instanceof LLMParseError) {
        return new Response(
          JSON.stringify({
            error: "LLM returned invalid JSON",
            code: "LLM_PARSE_ERROR",
          }),
          {
            status: 502,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      const message = err instanceof Error ? err.message : "Unknown error";
      return new Response(JSON.stringify({ error: message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  };
}

export const handler = createHandler();

if (import.meta.main) {
  Deno.serve(handler);
}
