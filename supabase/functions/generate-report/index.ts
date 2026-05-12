import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  formatAuthErrorMessage,
  resolveUserIdFromRequest as resolveSharedUserIdFromRequest,
} from "../_shared/auth.ts";
import {
  getAvailableProviders,
  getDefaultModel,
  getModel,
  isValidModelForProvider,
  PROVIDER_MODELS,
  type ProviderKey,
  VALID_PROVIDERS,
} from "../_shared/providers.ts";
import {
  type GeneratedSiteReport,
  parseGeneratedSiteReport,
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
  `You are a construction site report assistant. You convert numbered site notes from a construction site into a structured JSON report.

INPUT
- NOTES: numbered site notes captured on site. Each note is one input item — text, voice transcript, image, video, or document. Non-text items appear as placeholder strings (e.g. "[image attached]", "[video attached]", "[document attached]") at their position. You cannot see their contents, but you MUST acknowledge that visual/document evidence exists at that position by citing it inline.

OUTPUT
Return ONLY valid minified JSON in this exact shape:
  { "report": { "meta": {...}, "weather": ..., "workers": ..., "materials": [...], "issues": [...], "nextSteps": [...], "sections": [...] } }

- Always return the FULL report. Include every top-level field, even when empty.
- Use null for missing "weather" / "workers", [] for empty arrays, "" for missing strings.
- Do NOT wrap the JSON in markdown fences. Do NOT add prose before or after.

CITATIONS
- When a section, issue, material, or next-step is supported by one or more notes, cite them inline at the end of the relevant sentence using the form '[note N]' (1-based, matches the NOTES numbering you receive). Multiple citations: '[note 3][note 5]'.
- ALWAYS cite the originating note(s) for every issue, material, and section paragraph. Cite placeholder notes ("[image attached]" etc.) the same way — they are evidence the user has attached.
- Do NOT invent note numbers. Only cite notes that appear in the input.

SCHEMA
"meta":          { "title": str, "reportType": "site_visit|daily|inspection|safety|incident|progress", "summary": str, "visitDate": "YYYY-MM-DD"|null }
"weather":       { "conditions", "temperature", "wind", "impact" }              (object or null)
"workers":       { "totalWorkers": num, "workerHours", "notes",
                   "roles": [{ "role", "count": num, "notes" }] }                (object or null)
"materials":     [{ "name", "quantity", "quantityUnit", "condition", "status", "notes" }]
"issues":        [{ "title", "category", "severity", "status", "details", "actionRequired" }]
"nextSteps":     [str]
"sections":      [{ "title", "content": "markdown" }]

RULES
- Populate "meta.title" with a short, human-readable title (e.g. "Site Visit — Wet Weather") and "meta.summary" with a one-sentence overview.
- Use sections to capture work progress, observations, and narrative detail. Materials list everything mentioned (concrete, steel, timber, pipes, etc.) — do NOT extract cost/price information; that's handled outside this flow.
- NEVER invent data not in the notes. Keep strings concise. Deduplicate facts.

EXAMPLE
{ "report": { "meta": { "title": "Site Visit — Wet Weather", "reportType": "daily", "summary": "Wet conditions delayed concrete pour", "visitDate": null }, "weather": { "conditions": "wet", "temperature": "20C", "wind": null, "impact": "Pour delayed by 1 hour" }, "workers": null, "materials": [{ "name": "Concrete", "quantity": "50", "quantityUnit": "m³", "condition": null, "status": "delivered", "notes": null }], "issues": [], "nextSteps": ["Order rebar"], "sections": [{ "title": "Foundation Work", "content": "Concrete pour started in zone A despite wet weather." }] } }`;

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

export {
  getAvailableProviders,
  getDefaultModel,
  getModel,
  isValidModelForProvider,
  PROVIDER_MODELS,
  VALID_PROVIDERS,
};
export type { ProviderKey };

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

  const systemPrompt =
    (deps.systemPromptOverride && deps.systemPromptOverride.trim().length > 0)
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

  return {
    ...result,
    systemPrompt: request.system,
    userPrompt: request.prompt,
  };
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

export async function resolveUserIdFromRequest(
  req: Request,
  deps: Parameters<typeof resolveSharedUserIdFromRequest>[1] = {},
): Promise<string | null> {
  return resolveSharedUserIdFromRequest(req, {
    ...deps,
    onMissingSupabaseUrl: () => {
      console.warn("token_usage auth lookup skipped: missing SUPABASE_URL");
    },
    onJwtVerifyError: (error) => {
      console.error(
        "token_usage auth lookup failed:",
        formatAuthErrorMessage(error),
      );
    },
  });
}

async function defaultGetUserId(req: Request): Promise<string | null> {
  return resolveUserIdFromRequest(req);
}

function shouldIncludeDebugPrompts(): boolean {
  return Deno.env.get("INCLUDE_DEBUG_PROMPTS") === "true" ||
    Deno.env.get("USE_FIXTURES") === "true";
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
      const responsePayload: Record<string, unknown> = {
        report: result.report.report,
        usage: result.usage,
        provider: result.provider,
        model: result.model,
      };
      if (shouldIncludeDebugPrompts()) {
        responsePayload.systemPrompt = result.systemPrompt;
        responsePayload.userPrompt = result.userPrompt;
      }
      const responseBody = JSON.stringify(responsePayload);
      const tSerializeMs = performance.now() - tSerializeStart;

      console.log(
        `perf: llm=${tLlmMs.toFixed(0)}ms parseApply=${
          tParseMs.toFixed(1)
        }ms serialize=${
          tSerializeMs.toFixed(1)
        }ms responseBytes=${responseBody.length} provider=${result.provider} model=${result.model}`,
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
