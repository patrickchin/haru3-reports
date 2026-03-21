import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { generateText } from "npm:ai";
import { createOpenAICompatible } from "npm:@ai-sdk/openai-compatible";
import { createOpenAI } from "npm:@ai-sdk/openai";
import { createAnthropic } from "npm:@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "npm:@ai-sdk/google";
import { parseGeneratedSiteReport } from "./report-schema.ts";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

export const SYSTEM_PROMPT = `You are a construction site report assistant. Extract field notes into a structured JSON report.

Return ONLY valid JSON with this structure:

report.meta: title, reportType (site_visit/daily/inspection/safety/incident/progress), summary, visitDate (YYYY-MM-DD or null)

report.weather: conditions, temperature, wind, impact (all strings, null if unknown)

report.manpower: totalWorkers (number), workerHours, workersCostPerDay, workersCostCurrency, notes, roles[] (each with role, count, notes)

report.siteConditions[]: topic, details

report.activities[]: Main backbone of the report. Each has:
- name, description, location, status, summary
- contractors, engineers, visitors (strings)
- startDate, endDate (YYYY-MM-DD or null)
- sourceNoteIndexes[] (which input note numbers)
- manpower (same structure as report.manpower, or null)
- materials[]: name, quantity, quantityUnit, unitCost, unitCostCurrency, totalCost, totalCostCurrency, condition, status, notes
- equipment[]: name, quantity, cost, costCurrency, condition, ownership, status, hoursUsed, notes
- issues[]: title, category, severity, status, details, actionRequired, sourceNoteIndexes[]
- observations[]

report.issues[]: Top-level issues not tied to activities. Same structure as activity issues.

report.nextSteps[]: Array of strings

report.sections[]: Human-readable summary sections with title, content (markdown), sourceNoteIndexes[]

Rules:
- Include every top-level key. Use null for unknown objects, [] for empty lists.
- Keep strings concise. Don't invent data.
- Materials/equipment go inside their relevant activity.
- sourceNoteIndexes reference the [n] numbers from input.
- Deduplicate repeated facts.`;

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

export async function generateReportFromNotes(
  notes: string[],
  deps: GenerateReportDeps = {},
) {
  const provider = (
    deps.provider ?? Deno.env.get("AI_PROVIDER") ?? "kimi"
  ).toLowerCase();

  const model = (deps.getModelFn ?? getModel)(provider);

  const request = {
    model,
    system: SYSTEM_PROMPT,
    prompt: formatNotes(notes),
    temperature: 0.3,
  };

  if (deps.generateTextFn) {
    const { text } = await deps.generateTextFn(request);
    return parseGeneratedSiteReport(JSON.parse(text));
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
    maxTokens: 8000,
    providerOptions: {
      kimi: {
        response_format: { type: "json_object" },
      },
    },
  });

  console.log("LLM Stats:", {
    provider,
    promptTokens: usage?.promptTokens,
    completionTokens: usage?.completionTokens,
    totalTokens: usage?.totalTokens,
    finishReason,
  });
  console.log("Raw LLM response:\n", text);

  return parseGeneratedSiteReport(JSON.parse(text));
}

export function createHandler(deps: GenerateReportDeps = {}) {
  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }

    try {
      const { notes } = (await req.json()) as { notes?: unknown };

      if (!isValidNotes(notes)) {
        return new Response(
          JSON.stringify({ error: "notes must be a non-empty array of strings" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const result = await generateReportFromNotes(notes, deps);

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
