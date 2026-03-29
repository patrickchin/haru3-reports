import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { generateText } from "npm:ai";
import { createOpenAICompatible } from "npm:@ai-sdk/openai-compatible";
import { createOpenAI } from "npm:@ai-sdk/openai";
import { createAnthropic } from "npm:@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "npm:@ai-sdk/google";
import { parseGeneratedSiteReport } from "./report-schema.ts";
import type { GeneratedSiteReport } from "./report-schema.ts";
import { applyReportPatch } from "./apply-report-patch.ts";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

export const SYSTEM_PROMPT = `You are a construction site report assistant. Extract field notes into a structured JSON report.

Return ONLY valid JSON matching this shape:

"meta": { "title": "...", "reportType": "site_visit|daily|inspection|safety|incident|progress", "summary": "...", "visitDate": "YYYY-MM-DD" or null }

"weather": { "conditions": "...", "temperature": "...", "wind": "...", "impact": "..." } or null

"manpower": { "totalWorkers": number, "workerHours": "...", "workersCostPerDay": "...", "workersCostCurrency": "...", "notes": "...", "roles": [{ "role": "...", "count": number, "notes": "..." }] } or null

"siteConditions": [{ "topic": "...", "details": "..." }]

"activities": [ Main backbone of the report. Each has:
  { "name": "...", "description": "...", "location": "...", "status": "...", "summary": "...",
    "contractors": "...", "engineers": "...", "visitors": "...",
    "startDate": "YYYY-MM-DD" or null, "endDate": "YYYY-MM-DD" or null,
    "sourceNoteIndexes": [1, 2],
    "manpower": same structure as top-level manpower or null,
    "materials": [{ "name": "...", "quantity": "...", "quantityUnit": "...", "unitCost": "...", "unitCostCurrency": "...", "totalCost": "...", "totalCostCurrency": "...", "condition": "...", "status": "...", "notes": "..." }],
    "equipment": [{ "name": "...", "quantity": "...", "cost": "...", "costCurrency": "...", "condition": "...", "ownership": "...", "status": "...", "hoursUsed": "...", "notes": "..." }],
    "issues": [{ "title": "...", "category": "...", "severity": "...", "status": "...", "details": "...", "actionRequired": "...", "sourceNoteIndexes": [] }],
    "observations": ["..."]
  }
]

"issues": [ Top-level issues not tied to activities. Same structure as activity issues. ]

"nextSteps": ["..."]

"sections": [{ "title": "...", "content": "markdown string", "sourceNoteIndexes": [1, 2] }]

Always include every top-level key exactly once. Use null for unknown objects, [] for empty lists.
Build activities as the main structured backbone of the report.
Keep strings concise. Don't invent data.
Materials/equipment go inside their relevant activity.
sourceNoteIndexes reference the [n] numbers from input.
Deduplicate repeated facts.`;

export const INCREMENTAL_SYSTEM_PROMPT = `You are a construction site report assistant. You are UPDATING an existing report with new voice notes.

You will receive:
1. The current report JSON (under "CURRENT REPORT")
2. ALL field notes so far (under "ALL NOTES") — the latest notes are the new additions

Return ONLY valid JSON with the key "patch" containing ONLY the fields that need to change or be added.

Rules for the patch:
- For scalar fields (meta.summary, weather.temperature, etc.): include the new value to replace the old one.
- For array items (activities, issues, materials, equipment, siteConditions, sections):
  - To UPDATE an existing item: include it with the same "name"/"title"/"topic" and the changed fields.
  - To ADD a new item: include the full new item in the array.
  - NEVER remove items. Only include items that are new or changed.
- For string arrays (nextSteps, observations): include only NEW strings to add.
- For sourceNoteIndexes: include only NEW indexes to add (they will be merged).
- Omit any field that hasn't changed.
- NEVER invent data that isn't in the notes.
- Keep the patch as small as possible — only what's new or changed.

Example patch format:
{
  "patch": {
    "meta": { "summary": "Updated summary including new info" },
    "activities": [
      { "name": "Existing Activity", "status": "completed", "summary": "Updated summary" },
      { "name": "Brand New Activity", "status": "in_progress", "summary": "...", "sourceNoteIndexes": [5], "materials": [], "equipment": [], "issues": [], "observations": [] }
    ],
    "nextSteps": ["New step to add"]
  }
}`;

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
      })("moonshot-v1-128k");
    }
  }
}

export function isValidNotes(notes: unknown): notes is string[] {
  return Array.isArray(notes) && notes.length > 0 && notes.every((note) => typeof note === "string");
}

export function isValidExistingReport(value: unknown): value is GeneratedSiteReport {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const obj = value as Record<string, unknown>;

  if (typeof obj.report !== "object" || obj.report === null) {
    return false;
  }

  const report = obj.report as Record<string, unknown>;

  return (
    typeof report.meta === "object" &&
    report.meta !== null &&
    Array.isArray(report.activities)
  );
}

export function formatNotes(notes: string[]): string {
  return notes
    .map((note, i) => `[${i + 1}] ${note}`)
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

function buildIncrementalPrompt(
  notes: string[],
  existingReport: GeneratedSiteReport,
): string {
  return `CURRENT REPORT:
${JSON.stringify(existingReport, null, 2)}

ALL NOTES:
${formatNotes(notes)}`;
}

export async function generateReportFromNotes(
  notes: string[],
  deps: GenerateReportDeps = {},
  existingReport?: GeneratedSiteReport | null,
) {
  const provider = (
    deps.provider ?? Deno.env.get("AI_PROVIDER") ?? "kimi"
  ).toLowerCase();

  const model = (deps.getModelFn ?? getModel)(provider);

  const isIncremental = existingReport != null;
  const system = isIncremental ? INCREMENTAL_SYSTEM_PROMPT : SYSTEM_PROMPT;
  const prompt = isIncremental
    ? buildIncrementalPrompt(notes, existingReport)
    : formatNotes(notes);

  const request = {
    model,
    system,
    prompt,
    temperature: 0.3,
  };

  if (deps.generateTextFn) {
    const { text } = await deps.generateTextFn(request);
    const parsed = JSON.parse(text);

    if (isIncremental) {
      const patchData = parsed.patch ?? parsed;
      return applyReportPatch(existingReport, patchData);
    }

    return parseGeneratedSiteReport(parsed);
  }

  console.log("=== LLM INPUT ===");
  console.log("Mode:", isIncremental ? "incremental" : "full");
  console.log("SYSTEM:\n" + request.system);
  console.log("\nUSER:\n" + request.prompt);
  console.log("=== END INPUT ===\n");

  const { text, usage, finishReason } = await generateText({
    model: request.model as never,
    system: request.system,
    prompt: request.prompt,
    temperature: request.temperature,
    maxOutputTokens: isIncremental ? 4000 : 8000,
    providerOptions: {
      kimi: {
        response_format: { type: "json_object" },
      },
    },
  });

  console.log("LLM Stats:", {
    provider,
    mode: isIncremental ? "incremental" : "full",
    inputTokens: usage?.inputTokens,
    outputTokens: usage?.outputTokens,
    totalTokens: usage?.totalTokens,
    finishReason,
  });
  console.log("Raw LLM response:\n", text);

  const parsed = JSON.parse(text);

  if (isIncremental) {
    const patchData = parsed.patch ?? parsed;
    return applyReportPatch(existingReport, patchData);
  }

  return parseGeneratedSiteReport(parsed);
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
      };
      const { notes } = body;

      if (!isValidNotes(notes)) {
        return new Response(
          JSON.stringify({ error: "notes must be a non-empty array of strings" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const existingReport = isValidExistingReport(body.existingReport)
        ? (body.existingReport as GeneratedSiteReport)
        : null;

      const result = await generateReportFromNotes(notes, deps, existingReport);

      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (err) {
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
