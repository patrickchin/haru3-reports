import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import * as jose from "jsr:@panva/jose@6";
import { createOpenAICompatible } from "npm:@ai-sdk/openai-compatible";
import { createOpenAI } from "npm:@ai-sdk/openai";
import { createAnthropic } from "npm:@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "npm:@ai-sdk/google";
import {
  parseGeneratedSiteReport,
  type GeneratedSiteReport,
} from "./report-schema.ts";
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


export const EMPTY_REPORT: GeneratedSiteReport = {
  report: {
    meta: { title: "", reportType: "site_visit", summary: "", visitDate: null },
    weather: null,
    workers: null,
    materials: [],
    issues: [],
    nextSteps: [],
    sections: [],
  },
};

export const VALID_PROVIDERS = [
  "kimi",
  "openai",
  "anthropic",
  "google",
  "zai",
  "deepseek",
] as const;

export type ProviderKey = (typeof VALID_PROVIDERS)[number];

const PROVIDER_ENV_KEYS: Record<ProviderKey, string> = {
  kimi: "MOONSHOT_API_KEY",
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  google: "GOOGLE_AI_API_KEY",
  zai: "ZAI_API_KEY",
  deepseek: "DEEPSEEK_API_KEY",
};

export const PROVIDER_MODELS: Record<ProviderKey, { id: string; label: string }[]> = {
  kimi: [
    { id: "kimi-k2-0711-preview", label: "Kimi K2 (preview)" },
    { id: "moonshot-v1-32k", label: "Moonshot v1 32k" },
    { id: "moonshot-v1-128k", label: "Moonshot v1 128k" },
  ],
  openai: [
    { id: "gpt-4o-mini", label: "GPT-4o mini" },
    { id: "gpt-4o", label: "GPT-4o" },
    { id: "gpt-4.1-mini", label: "GPT-4.1 mini" },
  ],
  anthropic: [
    { id: "claude-sonnet-4-20250514", label: "Claude Sonnet 4" },
    { id: "claude-haiku-4-5", label: "Claude Haiku 4.5" },
    { id: "claude-opus-4-1", label: "Claude Opus 4.1" },
  ],
  google: [
    { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
    { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
    { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
  ],
  zai: [
    { id: "glm-4.6", label: "GLM-4.6" },
    { id: "glm-4-air", label: "GLM-4 Air" },
  ],
  deepseek: [
    { id: "deepseek-chat", label: "DeepSeek V3 (chat)" },
    { id: "deepseek-reasoner", label: "DeepSeek R1 (reasoner)" },
  ],
};

export function getDefaultModel(provider: ProviderKey): string {
  return PROVIDER_MODELS[provider][0].id;
}

export function isValidModelForProvider(provider: ProviderKey, model: string): boolean {
  return PROVIDER_MODELS[provider].some((m) => m.id === model);
}

export function getAvailableProviders(): string[] {
  return VALID_PROVIDERS.filter((p) => !!Deno.env.get(PROVIDER_ENV_KEYS[p]));
}

export function getModel(provider: string, modelId?: string) {
  const p = provider as ProviderKey;
  const resolvedModel = modelId && PROVIDER_MODELS[p]?.some((m) => m.id === modelId)
    ? modelId
    : PROVIDER_MODELS[p]?.[0]?.id ?? "";

  switch (provider) {
    case "openai": {
      const key = Deno.env.get("OPENAI_API_KEY");
      if (!key) throw new Error("OPENAI_API_KEY not set");
      return {
        instance: createOpenAI({ apiKey: key })(resolvedModel),
        modelId: resolvedModel,
      };
    }
    case "anthropic": {
      const key = Deno.env.get("ANTHROPIC_API_KEY");
      if (!key) throw new Error("ANTHROPIC_API_KEY not set");
      return {
        instance: createAnthropic({ apiKey: key })(resolvedModel),
        modelId: resolvedModel,
      };
    }
    case "google": {
      const key = Deno.env.get("GOOGLE_AI_API_KEY");
      if (!key) throw new Error("GOOGLE_AI_API_KEY not set");
      return {
        instance: createGoogleGenerativeAI({ apiKey: key })(resolvedModel),
        modelId: resolvedModel,
      };
    }
    case "kimi":
    default: {
      const key = Deno.env.get("MOONSHOT_API_KEY");
      if (!key) throw new Error("MOONSHOT_API_KEY not set");
      const fallback = resolvedModel || "kimi-k2-0711-preview";
      return {
        instance: createOpenAICompatible({
          name: "kimi",
          baseURL: "https://api.moonshot.cn/v1",
          apiKey: key,
        })(fallback),
        modelId: fallback,
      };
    }
    case "zai": {
      const key = Deno.env.get("ZAI_API_KEY");
      if (!key) throw new Error("ZAI_API_KEY not set");
      return {
        instance: createOpenAICompatible({
          name: "zai",
          baseURL: "https://api.z.ai/api/paas/v4",
          apiKey: key,
        })(resolvedModel),
        modelId: resolvedModel,
      };
    }
    case "deepseek": {
      const key = Deno.env.get("DEEPSEEK_API_KEY");
      if (!key) throw new Error("DEEPSEEK_API_KEY not set");
      return {
        instance: createOpenAICompatible({
          name: "deepseek",
          baseURL: "https://api.deepseek.com/v1",
          apiKey: key,
        })(resolvedModel),
        modelId: resolvedModel,
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
  systemPrompt: string;
  userPrompt: string;
};

export type GenerateResult = {
  report: GeneratedSiteReport;
  usage: TokenUsage | null;
  provider: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
};

type GenerateReportDeps = {
  provider?: string;
  model?: string;
  generateTextFn?: GenerateTextFn;
  getModelFn?: (provider: string, model?: string) => unknown;
  getUserIdFn?: (req: Request) => Promise<string | null>;
  usageContext?: UsageContext;
  recordUsageFn?: (params: RecordUsageParams) => Promise<void>;
  /**
   * Replaces the built-in SYSTEM_PROMPT for this call only. Currently used by
   * the playground edge function to let users iterate on prompt wording. The
   * production POST handler never reads this from the request body — callers
   * must pass it explicitly via deps.
   */
  systemPromptOverride?: string;
};

function buildPrompt(notes: string[]): string {
  return `NOTES:
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
): Promise<LLMRawResult> {
  const provider = (
    deps.provider ?? Deno.env.get("AI_PROVIDER") ?? "kimi"
  ).toLowerCase();

  const resolved = (deps.getModelFn ?? getModel)(provider, deps.model) as
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

  const prompt = buildPrompt(notes);

  const systemPrompt = (deps.systemPromptOverride && deps.systemPromptOverride.trim().length > 0)
    ? deps.systemPromptOverride
    : SYSTEM_PROMPT;

  const request = {
    model,
    system: systemPrompt,
    prompt,
    temperature: 0.3,
  };

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
      zai: { response_format: { type: "json_object" } },
      deepseek: { response_format: { type: "json_object" } },
    },
    generateTextFn: deps.generateTextFn,
    usageContext: deps.usageContext,
    recordUsageFn: deps.recordUsageFn,
  });

  return { ...result, systemPrompt: request.system, userPrompt: request.prompt };
}

export function parseLLMReport(raw: LLMRawResult): GenerateResult {
  const jsonText = extractJson(raw.text);
  try {
    const parsed = JSON.parse(jsonText);
    const report = parseGeneratedSiteReport(parsed);
    return {
      report,
      usage: raw.usage,
      provider: raw.provider,
      model: raw.model,
      systemPrompt: raw.systemPrompt,
      userPrompt: raw.userPrompt,
    };
  } catch (err) {
    throw new LLMParseError(raw.text, err);
  }
}

export async function generateReportFromNotes(
  notes: string[],
  deps: GenerateReportDeps = {},
): Promise<GenerateResult> {
  const raw = await fetchReportFromLLM(notes, deps);
  return parseLLMReport(raw);
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
      return new Response(
        JSON.stringify({ providers: available, models: PROVIDER_MODELS }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    try {
      // Extract user from JWT for usage tracking
      const getUserId = deps.getUserIdFn ?? defaultGetUserId;
      const userId = await getUserId(req);

      const body = (await req.json()) as {
        notes?: unknown;
        provider?: unknown;
        model?: unknown;
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

      const requestProvider = typeof body.provider === "string" &&
          VALID_PROVIDERS.includes(
            body.provider.toLowerCase() as typeof VALID_PROVIDERS[number],
          )
        ? body.provider.toLowerCase() as ProviderKey
        : undefined;

      const requestModel = typeof body.model === "string" &&
          requestProvider &&
          isValidModelForProvider(requestProvider, body.model)
        ? body.model
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
      if (requestModel) {
        effectiveDeps.model = requestModel;
      }

      // Step 1: Fetch from LLM and record usage in the shared wrapper
      const tLlmStart = performance.now();
      const llmResult = await fetchReportFromLLM(notes, effectiveDeps);
      const tLlmMs = performance.now() - tLlmStart;

      // Step 2: Parse and validate the report
      const tParseStart = performance.now();
      const result = parseLLMReport(llmResult);
      const tParseMs = performance.now() - tParseStart;

      // Step 3: Serialize response
      const tSerializeStart = performance.now();
      const responseBody = JSON.stringify({
        report: result.report.report,
        usage: result.usage,
        systemPrompt: result.systemPrompt,
        userPrompt: result.userPrompt,
      });
      const tSerializeMs = performance.now() - tSerializeStart;

      console.log(
        `perf: llm=${tLlmMs.toFixed(0)}ms parseApply=${
          tParseMs.toFixed(1)
        }ms serialize=${tSerializeMs.toFixed(1)}ms responseBytes=${responseBody.length} provider=${result.provider} model=${result.model}`,
      );

      return new Response(responseBody, {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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
  // USE_FIXTURES=true serves captured LLM responses instead of calling the
  // real provider. Used by the local Maestro E2E setup (see docs/09-testing.md
  // "Local E2E"). Imported lazily so production deploys don't read fixture
  // files at startup.
  if (Deno.env.get("USE_FIXTURES") === "true") {
    const { fixturesGenerateTextFn, fixturesGetModelFn } = await import(
      "./use-fixtures.ts"
    );
    console.log(
      "[generate-report] USE_FIXTURES=true — serving captured fixtures, " +
      "no provider API will be called.",
    );
    Deno.serve(
      createHandler({
        generateTextFn: fixturesGenerateTextFn,
        getModelFn: fixturesGetModelFn,
        // Skip JWT/JWKS verification in fixture mode — the edge runtime runs
        // inside Docker where 127.0.0.1 doesn't reach the host auth service,
        // causing the JWKS fetch to hang until wall-clock termination.
        getUserIdFn: async () => null,
      }),
    );
  } else {
    Deno.serve(handler);
  }
}
