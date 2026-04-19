import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { generateText } from "npm:ai";
import { createOpenAICompatible } from "npm:@ai-sdk/openai-compatible";
import { createOpenAI } from "npm:@ai-sdk/openai";
import { createAnthropic } from "npm:@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "npm:@ai-sdk/google";
import type { GeneratedSiteReport } from "./report-schema.ts";
import { applyReportPatch } from "./apply-report-patch.ts";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

export const SYSTEM_PROMPT = `You are a construction site report assistant. Build and update structured JSON reports from voice notes.

Input: CURRENT REPORT (JSON, may be empty) + ALL NOTES or NEW NOTES (earlier notes already in report). Use [n] numbers for sourceNoteIndexes.

Return ONLY valid, minified JSON (no extra whitespace or newlines): { "patch": { ...fields to add/change... } }
Omit any field that is null, empty string, or empty array — they are treated as absent.

Schema:
"meta": { "title": str, "reportType": "site_visit|daily|inspection|safety|incident|progress", "summary": str, "visitDate": "YYYY-MM-DD"|null }
"weather": { "conditions", "temperature", "wind", "impact" }|null
"manpower": { "totalWorkers": num, "workerHours", "workersCostPerDay", "workersCostCurrency", "notes", "roles": [{ "role", "count": num, "notes" }] }|null
"siteConditions": [{ "topic", "details" }]
"activities": [ Build activities as the main structured backbone of the report.
  { "name", "description", "location", "status", "summary", "contractors", "engineers", "visitors",
    "startDate": "YYYY-MM-DD"|null, "endDate": "YYYY-MM-DD"|null, "sourceNoteIndexes": [1, 2],
    "manpower": same as top-level|null,
    "materials": [{ "name", "quantity", "quantityUnit", "unitCost", "unitCostCurrency", "totalCost", "totalCostCurrency", "condition", "status", "notes" }],
    "equipment": [{ "name", "quantity", "cost", "costCurrency", "condition", "ownership", "status", "hoursUsed", "notes" }],
    "issues": [{ "title", "category", "severity", "status", "details", "actionRequired", "sourceNoteIndexes": [] }],
    "observations": [str] }]
"issues": [ Top-level issues (same shape as activity issues) ]
"nextSteps": [str]
"sections": [{ "title", "content": "markdown", "sourceNoteIndexes": [1, 2] }]

Patch rules:
- Scalars: new value replaces old. Arrays: match by name/title/topic to UPDATE, or add full new item. NEVER remove items.
- String arrays (nextSteps, observations): only NEW strings. sourceNoteIndexes: only NEW indexes (merged).
- Omit unchanged fields.
- NEVER invent data not in the notes. Keep strings concise. Deduplicate facts.
- Materials/equipment go inside their activity. Extract ALL materials (concrete, steel, timber, pipes, etc.) and equipment (excavators, cranes, pumps, etc.) mentioned.
- Always populate meta.title and meta.summary.

Example: { "patch": { "meta": { "summary": "Updated" }, "activities": [{ "name": "Existing", "status": "completed" }, { "name": "New", "status": "in_progress", "sourceNoteIndexes": [5] }], "nextSteps": ["New step"] } }`;

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
  },
};

export function getModel(provider: string) {
  switch (provider) {
    case "openai": {
      const key = Deno.env.get("OPENAI_API_KEY");
      if (!key) throw new Error("OPENAI_API_KEY not set");
      return createOpenAI({ apiKey: key })("gpt-4o-mini");
    }
    case "anthropic": {
      const key = Deno.env.get("ANTHROPIC_API_KEY");
      if (!key) throw new Error("ANTHROPIC_API_KEY not set");
      return createAnthropic({ apiKey: key })("claude-sonnet-4-20250514");
    }
    case "google": {
      const key = Deno.env.get("GOOGLE_AI_API_KEY");
      if (!key) throw new Error("GOOGLE_AI_API_KEY not set");
      return createGoogleGenerativeAI({ apiKey: key })("gemini-2.0-flash");
    }
    case "kimi":
    default: {
      const key = Deno.env.get("MOONSHOT_API_KEY");
      if (!key) throw new Error("MOONSHOT_API_KEY not set");
      return createOpenAICompatible({
        name: "kimi",
        baseURL: "https://api.moonshot.cn/v1",
        apiKey: key,
      })("kimi-k2-0711-preview");
    }
  }
}

export function isValidNotes(notes: unknown): notes is string[] {
  return Array.isArray(notes) && notes.length > 0 && notes.every((note) => typeof note === "string");
}

export function formatNotes(notes: string[], startIndex = 0): string {
  return notes
    .map((note, i) => `[${startIndex + i + 1}] ${note}`)
    .join("\n");
}

type GenerateReportDeps = {
  provider?: string;
  generateTextFn?: (args: {
    model: unknown;
    system: string;
    prompt: string;
    temperature: number;
  }) => Promise<{ text: string }>;
  getModelFn?: (provider: string) => unknown;
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

  const isIncremental =
    lastProcessedNoteCount !== undefined &&
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

export async function generateReportFromNotes(
  notes: string[],
  deps: GenerateReportDeps = {},
  existingReport?: GeneratedSiteReport | null,
  lastProcessedNoteCount?: number,
) {
  const provider = (
    deps.provider ?? Deno.env.get("AI_PROVIDER") ?? "kimi"
  ).toLowerCase();

  const model = (deps.getModelFn ?? getModel)(provider);

  const base = existingReport ?? EMPTY_REPORT;
  const prompt = buildPrompt(notes, base, lastProcessedNoteCount);

  const request = {
    model,
    system: SYSTEM_PROMPT,
    prompt,
    temperature: 0.3,
  };

  if (deps.generateTextFn) {
    const { text } = await deps.generateTextFn(request);
    const jsonText = extractJson(text);
    try {
      const parsed = JSON.parse(jsonText);
      const patchData = parsed.patch ?? parsed;
      return applyReportPatch(base, patchData);
    } catch (err) {
      throw new LLMParseError(text, err);
    }
  }

  console.log("=== LLM INPUT ===");
  console.log("SYSTEM:\n" + request.system);
  console.log("\nUSER:\n" + request.prompt);
  console.log("=== END INPUT ===\n");

  const { text, usage, finishReason } = await generateText({
    model: request.model as never,
    messages: [
      {
        role: "system",
        content: request.system,
        providerOptions: {
          anthropic: { cacheControl: { type: "ephemeral" } },
        },
      },
      {
        role: "user",
        content: request.prompt,
      },
    ],
    temperature: request.temperature,
    maxOutputTokens: 8000,
    providerOptions: {
      kimi: { response_format: { type: "json_object" } },
      openaiCompatible: { response_format: { type: "json_object" } },
    },
  });

  console.log("LLM Stats:", {
    provider,
    inputTokens: usage?.inputTokens,
    outputTokens: usage?.outputTokens,
    totalTokens: usage?.totalTokens,
    finishReason,
  });
  console.log("Raw LLM response:\n", text);

  const jsonText = extractJson(text);
  try {
    const parsed = JSON.parse(jsonText);
    const patchData = parsed.patch ?? parsed;
    return applyReportPatch(base, patchData);
  } catch (err) {
    throw new LLMParseError(text, err);
  }
}

export function createHandler(deps: GenerateReportDeps = {}) {
  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }

    try {
      const body = (await req.json()) as {
        notes?: unknown;
        existingReport?: unknown;
        lastProcessedNoteCount?: unknown;
      };
      const { notes } = body;

      if (!isValidNotes(notes)) {
        return new Response(
          JSON.stringify({ error: "notes must be a non-empty array of strings" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const raw = body.existingReport;
      const existingReport =
        typeof raw === "object" &&
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

      const result = await generateReportFromNotes(notes, deps, existingReport, lastProcessedNoteCount);

      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (err) {
      if (err instanceof LLMParseError) {
        return new Response(
          JSON.stringify({ error: "LLM returned invalid JSON", code: "LLM_PARSE_ERROR" }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
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
