import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { generateText } from "npm:ai";
import { createOpenAICompatible } from "npm:@ai-sdk/openai-compatible";
import { createOpenAI } from "npm:@ai-sdk/openai";
import { createAnthropic } from "npm:@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "npm:@ai-sdk/google";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You are a construction site report assistant. You will receive an array of raw field notes taken during a site visit.

Extract and organise the information into a structured site visit report. Use only the following section names where relevant:
- Weather: conditions, temperature, wind if mentioned
- Manpower: headcount, trades, roles
- Work Progress: what work was done, zones, completion status
- Site Conditions: state of the site, cleanliness, any conditions noted
- Observations: schedule, budget, general observations
- Issues: safety concerns, equipment problems, delays, complaints

Return ONLY valid JSON matching this schema — no markdown, no explanation, no wrapping:
{ "report": [{ "section": "<section name>", "content": "<prose>" }] }

Rules:
- Write each section as clear, professional prose suitable for a formal site visit report.
- If a section has no relevant information in the notes, omit it entirely.
- Do not invent information not present in the notes.
- Combine related notes from different entries into coherent paragraphs.`;

function getModel(provider: string) {
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { notes } = (await req.json()) as { notes: string[] };

    if (!Array.isArray(notes) || notes.length === 0) {
      return new Response(
        JSON.stringify({ error: "notes must be a non-empty array of strings" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const formatted = notes
      .map((n, i) => `[${i + 1}] ${n}`)
      .join("\n");

    const provider = (
      Deno.env.get("AI_PROVIDER") ?? "kimi"
    ).toLowerCase();

    const model = getModel(provider);

    const { text } = await generateText({
      model,
      system: SYSTEM_PROMPT,
      prompt: formatted,
      temperature: 0.3,
    });

    const result = JSON.parse(text);

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
});
