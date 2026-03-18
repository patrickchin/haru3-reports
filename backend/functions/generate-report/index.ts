import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { generateText } from "npm:ai";
import { createOpenAICompatible } from "npm:@ai-sdk/openai-compatible";
import { createOpenAI } from "npm:@ai-sdk/openai";
import { createAnthropic } from "npm:@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "npm:@ai-sdk/google";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

export const SYSTEM_PROMPT = `You are a construction site report assistant. You will receive an array of raw field notes taken during a site visit.

Extract and organise the information into a structured site visit report. Use only the following section names where relevant:
- Weather: conditions, temperature, wind if mentioned
- Manpower: headcount by trade/role
- Work Progress: what work was done, zones, completion status
- Materials: deliveries received, materials used, stock levels, reorders needed
- Equipment: plant/equipment on site, hours used, issues
- Site Conditions: state of the site, cleanliness, any conditions noted
- Observations: schedule, budget, general observations
- Issues: safety concerns, delays, complaints, defects

Return ONLY valid JSON matching this schema — no code fences, no explanation, no wrapping:
{ "report": [{ "section": "<section name>", "content": "<text or markdown>" }] }

Rules:
- Be concise. Keep each section to 2-3 short sentences max — no lengthy paragraphs.
- For Materials and Equipment sections, use a markdown table (with columns like Item, Qty, Status/Notes) inside the content value.
- For other sections, use brief dot-points (using "- ") or short sentences. Get straight to the point.
- If a section has no relevant information in the notes, omit it entirely.
- Do not invent information not present in the notes.
- Combine related notes into concise summaries — do not repeat or pad information.`;

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
      })("moonshot-v1-8k");
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
    return JSON.parse(text);
  }

  const { text } = await generateText({
    model: request.model as never,
    system: request.system,
    prompt: request.prompt,
    temperature: request.temperature,
  });

  return JSON.parse(text);
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
