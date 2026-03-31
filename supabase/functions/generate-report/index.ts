import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { generateText } from "npm:ai";
import { createOpenAICompatible } from "npm:@ai-sdk/openai-compatible";
import { createOpenAI } from "npm:@ai-sdk/openai";
import { createAnthropic } from "npm:@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "npm:@ai-sdk/google";
import { parseGeneratedSiteReport, type GeneratedSiteReport } from "./report-schema.ts";
import { applyReportPatch, type Operation } from "./apply-report-patch.ts";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

export const SYSTEM_PROMPT = `You are a construction site report assistant. You build and update structured JSON reports from voice notes.

You will receive:
1. The current report JSON (under "CURRENT REPORT") — this may be empty for the first set of notes
2. ALL field notes so far (under "ALL NOTES")

Return ONLY valid JSON with the key "ops" containing an array of JSON Patch (RFC 6902) operations.

Each operation is an object with:
- "op": "add" | "replace" | "remove"
- "path": JSON Pointer to the target location (see Path Syntax below)
- "value": the new value (required for "add" and "replace"; omit for "remove")

Path syntax:
- Standard pointer: /report/meta/summary
- Array append: /report/activities/- (adds a new item at the end)
- Selector shorthand: /report/activities[name=Concrete Pour]/status
  Finds the array element whose field matches the given value (case-insensitive).
  Supported selectors:
    [name=...]  — activities, materials, equipment
    [title=...] — issues, sections
    [topic=...] — siteConditions
    [role=...]  — manpower.roles

When to use each op:
- "replace" — update an existing value (scalar, object, or array)
- "add" with path ending in /- — append an item to an array
- "remove" — delete an item (use selector to target it)

The report schema:

"meta": { "title": string, "reportType": "site_visit|daily|inspection|safety|incident|progress", "summary": string, "visitDate": "YYYY-MM-DD" | null }

"weather": { "conditions": string|null, "temperature": string|null, "wind": string|null, "impact": string|null } | null

"manpower": { "totalWorkers": number|null, "workerHours": string|null, "workersCostPerDay": string|null, "workersCostCurrency": string|null, "notes": string|null, "roles": [{ "role": string, "count": number|null, "notes": string|null }] } | null

"siteConditions": [{ "topic": string, "details": string }]

"activities": [
  { "name": string, "description": string|null, "location": string|null, "status": string, "summary": string,
    "contractors": string|null, "engineers": string|null, "visitors": string|null,
    "startDate": "YYYY-MM-DD"|null, "endDate": "YYYY-MM-DD"|null,
    "sourceNoteIndexes": [1, 2],
    "manpower": same structure as top-level manpower | null,
    "materials": [{ "name": string, "quantity": string|null, "quantityUnit": string|null, "unitCost": string|null, "unitCostCurrency": string|null, "totalCost": string|null, "totalCostCurrency": string|null, "condition": string|null, "status": string|null, "notes": string|null }],
    "equipment": [{ "name": string, "quantity": string|null, "cost": string|null, "costCurrency": string|null, "condition": string|null, "ownership": string|null, "status": string|null, "hoursUsed": string|null, "notes": string|null }],
    "issues": [{ "title": string, "category": string, "severity": string, "status": string, "details": string, "actionRequired": string|null, "sourceNoteIndexes": [] }],
    "observations": [string]
  }
]

"issues": [ Top-level issues not tied to activities. Same structure as activity issues. ]

"nextSteps": [string]

"sections": [{ "title": string, "content": "markdown string", "sourceNoteIndexes": [1, 2] }]

Rules:
- Use "replace" to update any existing field in the current report.
- Use "add" with /- to append new items to arrays (activities, issues, materials, nextSteps, etc.).
- When adding a new activity, include ALL required fields with sensible defaults in the value.
- Omit ops for fields that haven't changed — keep the ops array as small as possible.
- NEVER invent data that isn't in the notes.
- Build activities as the main structured backbone of the report.
- Keep strings concise.
- Materials/equipment go inside their relevant activity.
- Extract ALL materials mentioned in notes — concrete, steel, timber, pipes, membranes, fixings, etc.
- Extract ALL equipment/plant — excavators, cranes, pumps, etc. Include hours, condition, operator if noted.
- Always set meta.title and meta.summary even for small note sets.
- sourceNoteIndexes reference the [n] numbers from input.
- Deduplicate repeated facts.

Example — first generation (empty report):
{
  "ops": [
    { "op": "replace", "path": "/report/meta/title", "value": "Daily Site Visit Report" },
    { "op": "replace", "path": "/report/meta/reportType", "value": "daily" },
    { "op": "replace", "path": "/report/meta/summary", "value": "Concrete pour completed." },
    { "op": "add", "path": "/report/activities/-", "value": {
        "name": "Concrete Pour", "description": null, "location": "Zone A", "status": "completed",
        "summary": "Pour completed in Zone A.", "contractors": null, "engineers": null, "visitors": null,
        "startDate": null, "endDate": null, "sourceNoteIndexes": [1],
        "manpower": null,
        "materials": [{ "name": "Concrete 32MPA", "quantity": "16", "quantityUnit": "m3", "unitCost": null, "unitCostCurrency": null, "totalCost": null, "totalCostCurrency": null, "condition": "Good", "status": "delivered", "notes": null }],
        "equipment": [], "issues": [], "observations": []
    }},
    { "op": "add", "path": "/report/nextSteps/-", "value": "Cure slab 24h" }
  ]
}

Example — incremental update (report already has activities):
{
  "ops": [
    { "op": "replace", "path": "/report/meta/summary", "value": "Updated summary with afternoon progress." },
    { "op": "replace", "path": "/report/activities[name=Concrete Pour]/status", "value": "in_progress" },
    { "op": "add", "path": "/report/activities[name=Concrete Pour]/materials/-", "value": { "name": "Rebar N12", "quantity": "2t", "quantityUnit": "t", "unitCost": null, "unitCostCurrency": null, "totalCost": null, "totalCostCurrency": null, "condition": null, "status": "delivered", "notes": null } },
    { "op": "add", "path": "/report/activities/-", "value": {
        "name": "Formwork", "description": null, "location": "Zone B", "status": "in_progress",
        "summary": "Formwork started.", "contractors": null, "engineers": null, "visitors": null,
        "startDate": null, "endDate": null, "sourceNoteIndexes": [3],
        "manpower": null, "materials": [], "equipment": [], "issues": [], "observations": []
    }}
  ]
}`;

export const EMPTY_REPORT: GeneratedSiteReport = {
  report: {
    meta: { title: "", reportType: "", summary: "", visitDate: null },
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
      })("moonshot-v1-128k");
    }
  }
}

export function isValidNotes(notes: unknown): notes is string[] {
  return Array.isArray(notes) && notes.length > 0 && notes.every((note) => typeof note === "string");
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

function buildPrompt(
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

  const base = existingReport ?? EMPTY_REPORT;
  const prompt = buildPrompt(notes, base);

  const request = {
    model,
    system: SYSTEM_PROMPT,
    prompt,
    temperature: 0.3,
  };

  if (deps.generateTextFn) {
    const { text } = await deps.generateTextFn(request);
    const parsed = JSON.parse(text);
    const ops: Operation[] = parsed.ops ?? parsed;
    return parseGeneratedSiteReport(applyReportPatch(base, ops));
  }

  console.log("=== LLM INPUT ===");
  console.log("SYSTEM:\n" + request.system);
  console.log("\nUSER:\n" + request.prompt);
  console.log("=== END INPUT ===\n");

  const { text, usage, finishReason } = await generateText({
    model: request.model as never,
    system: request.system,
    prompt: request.prompt,
    temperature: request.temperature,
    maxOutputTokens: 8000,
    providerOptions: {
      kimi: {
        response_format: { type: "json_object" },
      },
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

  const parsed = JSON.parse(text);
  const ops: Operation[] = parsed.ops ?? parsed;
  return parseGeneratedSiteReport(applyReportPatch(base, ops));
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

      const raw = body.existingReport;
      const existingReport =
        typeof raw === "object" &&
        raw !== null &&
        typeof (raw as Record<string, unknown>).report === "object"
          ? (raw as GeneratedSiteReport)
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
