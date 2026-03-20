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

export const SYSTEM_PROMPT = `You are a construction site report assistant. You will receive an array of raw field notes taken during a site visit.

Extract and organise the information into a structured site visit report. Model it like a JSON replacement for a relational site report:
- report.meta = report header / high-level details
- report.activities = activity records that would previously be linked through site activity tables
- activity.materials / activity.equipment = inline replacements for link tables
- report.sections = human-readable report sections for final rendering

Return ONLY valid JSON matching this shape — no code fences, no explanation, no wrapping:
{
  "report": {
    "meta": {
      "title": "string",
      "reportType": "site_visit | daily | inspection | safety | incident | progress",
      "summary": "string",
      "visitDate": "YYYY-MM-DD or null"
    },
    "weather": {
      "conditions": "string or null",
      "temperature": "string or null",
      "wind": "string or null",
      "impact": "string or null"
    } | null,
    "manpower": {
      "totalWorkers": "number or null",
      "workerHours": "string or null",
      "notes": "string or null",
      "roles": [
        {
          "role": "string",
          "count": "number or null",
          "notes": "string or null"
        }
      ]
    } | null,
    "siteConditions": [
      {
        "topic": "string",
        "details": "string"
      }
    ],
    "activities": [
      {
        "name": "string",
        "location": "string or null",
        "status": "string",
        "summary": "string",
        "sourceNoteIndexes": [1, 2],
        "manpower": {
          "totalWorkers": "number or null",
          "workerHours": "string or null",
          "notes": "string or null",
          "roles": [
            {
              "role": "string",
              "count": "number or null",
              "notes": "string or null"
            }
          ]
        } | null,
        "materials": [
          {
            "name": "string",
            "quantity": "string or null",
            "status": "string or null",
            "notes": "string or null"
          }
        ],
        "equipment": [
          {
            "name": "string",
            "quantity": "string or null",
            "status": "string or null",
            "hoursUsed": "string or null",
            "notes": "string or null"
          }
        ],
        "issues": [
          {
            "title": "string",
            "category": "string",
            "severity": "string",
            "status": "string",
            "details": "string",
            "actionRequired": "string or null",
            "sourceNoteIndexes": [1, 2]
          }
        ],
        "observations": ["string"]
      }
    ],
    "issues": [
      {
        "title": "string",
        "category": "string",
        "severity": "string",
        "status": "string",
        "details": "string",
        "actionRequired": "string or null",
        "sourceNoteIndexes": [1, 2]
      }
    ],
    "nextSteps": ["string"],
    "sections": [
      {
        "title": "Weather | Manpower | Work Progress | Materials | Equipment | Site Conditions | Observations | Issues | Next Steps",
        "content": "brief markdown or dot points",
        "sourceNoteIndexes": [1, 2]
      }
    ]
  }
}

Rules:
- Always include every top-level key exactly once. Use null for unknown single objects and [] for missing lists.
- Keep strings concise and factual. Do not invent people, dates, quantities, costs, or statuses.
- Build activities as the main structured backbone of the report. Materials and equipment should live inside the most relevant activity where possible.
- If information is not tied to a specific activity, create a sensible general activity such as "General site operations" or put it in top-level issues / siteConditions / nextSteps as appropriate.
- Use the bracketed note numbers provided in the prompt when filling sourceNoteIndexes.
- Deduplicate repeated facts from rambling or transcribed notes.
- sections should read like the final report, while the other fields should stay structured and easy to consume in code.`;

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
    return parseGeneratedSiteReport(JSON.parse(text));
  }

  const { text } = await generateText({
    model: request.model as never,
    system: request.system,
    prompt: request.prompt,
    temperature: request.temperature,
  });

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
