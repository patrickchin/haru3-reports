import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  generateReportFromNotes,
  isValidNotes,
  VALID_PROVIDERS,
  PROVIDER_MODELS,
  isValidModelForProvider,
  getModel as defaultGetModel,
  getAvailableProviders,
  corsHeaders as baseCorsHeaders,
  SYSTEM_PROMPT,
  type ProviderKey,
} from "../generate-report/index.ts";
import { createOpenAICompatible } from "npm:@ai-sdk/openai-compatible";
import { createOpenAI } from "npm:@ai-sdk/openai";
import { createAnthropic } from "npm:@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "npm:@ai-sdk/google";

// ---------------------------------------------------------------------------
// CORS — allow the x-playground-key header in addition to standard headers
// ---------------------------------------------------------------------------

export const corsHeaders: Record<string, string> = {
  ...baseCorsHeaders,
  "Access-Control-Allow-Headers":
    `${baseCorsHeaders["Access-Control-Allow-Headers"]}, x-playground-key`,
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ---------------------------------------------------------------------------
// Access key validation (timing-safe)
// ---------------------------------------------------------------------------

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const encoder = new TextEncoder();
  const aBuf = encoder.encode(a);
  const bBuf = encoder.encode(b);
  let mismatch = 0;
  for (let i = 0; i < aBuf.length; i++) {
    mismatch |= aBuf[i] ^ bBuf[i];
  }
  return mismatch === 0;
}

export type ValidateKeyDeps = {
  expectedKey: string;
};

/** Returns null when the key is valid; otherwise the Response to short-circuit. */
export function validateKey(req: Request, deps: ValidateKeyDeps): Response | null {
  if (!deps.expectedKey) {
    return jsonResponse(
      500,
      { error: "Server not configured — REVIEW_ACCESS_KEY is missing" },
    );
  }
  const provided = req.headers.get("x-playground-key") ?? "";
  if (!provided || !timingSafeEqual(provided, deps.expectedKey)) {
    return jsonResponse(401, { error: "Invalid access key" });
  }
  return null;
}

// ---------------------------------------------------------------------------
// Rate limiting (in-memory, per-IP, resets on cold start)
// ---------------------------------------------------------------------------

export const RATE_LIMIT_MAX = 30;
export const RATE_LIMIT_WINDOW_MS = 60_000;

export type RateLimitState = Map<string, { count: number; windowStart: number }>;

export type RateLimitDeps = {
  state: RateLimitState;
  /** Override `Date.now` for tests. */
  now?: () => number;
};

export function checkRateLimit(req: Request, deps: RateLimitDeps): Response | null {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("cf-connecting-ip") ??
    "unknown";

  const now = (deps.now ?? Date.now)();
  const entry = deps.state.get(ip);

  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    deps.state.set(ip, { count: 1, windowStart: now });
    return null;
  }

  entry.count++;
  if (entry.count > RATE_LIMIT_MAX) {
    return jsonResponse(429, { error: "Rate limit exceeded — try again in a minute" });
  }

  return null;
}

// ---------------------------------------------------------------------------
// Provider/key resolution (factory used by the handler)
// ---------------------------------------------------------------------------

const ENV_KEY_MAP: Record<string, string> = {
  kimi: "MOONSHOT_API_KEY",
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  google: "GOOGLE_AI_API_KEY",
  zai: "ZAI_API_KEY",
  deepseek: "DEEPSEEK_API_KEY",
};

export type GetEnvFn = (name: string) => string | undefined;

/**
 * Build a `getModelFn` that prefers a client-supplied API key (from the
 * playground UI) over the server's environment variable. Exported so tests
 * can drive it directly without spinning up the LLM SDKs.
 */
export function buildGetModelWithOverrides(
  clientKeys: Record<string, string>,
  getEnv: GetEnvFn = (k) => Deno.env.get(k) ?? undefined,
) {
  return function getModelWithOverrides(provider: string, modelId?: string) {
    const clientKey = clientKeys[provider];
    const envKey = getEnv(ENV_KEY_MAP[provider] ?? "");
    const apiKey = clientKey || envKey;

    // No key available — fall through to the default getModel which
    // throws a descriptive "key not set" error.
    if (!apiKey) return defaultGetModel(provider, modelId);

    const p = provider as ProviderKey;
    const list = PROVIDER_MODELS[p];
    const resolved = modelId && list?.some((m) => m.id === modelId)
      ? modelId
      : list?.[0]?.id ?? "";

    switch (provider) {
      case "openai":
        return { instance: createOpenAI({ apiKey })(resolved), modelId: resolved };
      case "anthropic":
        return { instance: createAnthropic({ apiKey })(resolved), modelId: resolved };
      case "google":
        return { instance: createGoogleGenerativeAI({ apiKey })(resolved), modelId: resolved };
      case "zai":
        return {
          instance: createOpenAICompatible({ name: "zai", baseURL: "https://api.z.ai/api/paas/v4", apiKey })(resolved),
          modelId: resolved,
        };
      case "deepseek":
        return {
          instance: createOpenAICompatible({ name: "deepseek", baseURL: "https://api.deepseek.com/v1", apiKey })(resolved),
          modelId: resolved,
        };
      case "kimi":
      default: {
        const fallback = resolved || "kimi-k2-0711-preview";
        return {
          instance: createOpenAICompatible({ name: "kimi", baseURL: "https://api.moonshot.cn/v1", apiKey })(fallback),
          modelId: fallback,
        };
      }
    }
  };
}

// ---------------------------------------------------------------------------
// Handler factory
// ---------------------------------------------------------------------------

export type HandlerDeps = {
  /** REVIEW_ACCESS_KEY (sourced from env at module load by default). */
  expectedKey: string;
  /** Per-IP rate-limit state. Each handler instance owns a fresh map. */
  rateLimitState: RateLimitState;
  /** Override `Date.now` for tests. */
  now?: () => number;
  /** Override env reads (for tests / playground key shadowing). */
  getEnv?: GetEnvFn;
  /** Inject a custom `generateReportFromNotes` for tests. */
  generate?: typeof generateReportFromNotes;
};

export function createHandler(deps: HandlerDeps) {
  const generate = deps.generate ?? generateReportFromNotes;
  const getEnv = deps.getEnv ?? ((k) => Deno.env.get(k) ?? undefined);

  return async function handler(req: Request): Promise<Response> {
    try {
      // CORS preflight
      if (req.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders });
      }

      // GET — return which providers have server-side keys + model catalog
      if (req.method === "GET") {
        const keyErr = validateKey(req, { expectedKey: deps.expectedKey });
        if (keyErr) return keyErr;
        return jsonResponse(200, {
          serverProviders: getAvailableProviders(),
          models: PROVIDER_MODELS,
          defaultSystemPrompt: SYSTEM_PROMPT,
        });
      }

      // Only POST allowed beyond this point
      if (req.method !== "POST") {
        return jsonResponse(405, { error: "Method not allowed" });
      }

      // Gate: access key
      const keyErr = validateKey(req, { expectedKey: deps.expectedKey });
      if (keyErr) return keyErr;

      // Gate: rate limit
      const rateErr = checkRateLimit(req, {
        state: deps.rateLimitState,
        now: deps.now,
      });
      if (rateErr) return rateErr;

      // Parse body
      let body: {
        notes?: unknown;
        provider?: unknown;
        model?: unknown;
        providerKeys?: unknown;
        systemPromptOverride?: unknown;
      };

      try {
        body = await req.json();
      } catch {
        return jsonResponse(400, { error: "Invalid JSON body" });
      }

      const { notes } = body;
      if (!isValidNotes(notes)) {
        return jsonResponse(400, { error: "notes must be a non-empty array of strings" });
      }

      const requestProvider: ProviderKey | undefined =
        typeof body.provider === "string" &&
        VALID_PROVIDERS.includes(
          body.provider.toLowerCase() as (typeof VALID_PROVIDERS)[number],
        )
          ? body.provider.toLowerCase() as ProviderKey
          : undefined;

      const requestModel: string | undefined =
        typeof body.model === "string" &&
        requestProvider &&
        isValidModelForProvider(requestProvider, body.model)
          ? body.model
          : undefined;

      // Build getModelFn that uses client-provided keys as overrides
      const clientKeys: Record<string, string> = {};
      if (
        body.providerKeys &&
        typeof body.providerKeys === "object" &&
        !Array.isArray(body.providerKeys)
      ) {
        for (const [k, v] of Object.entries(body.providerKeys as Record<string, unknown>)) {
          if (typeof v === "string" && v.trim()) clientKeys[k] = v.trim();
        }
      }

      const getModelWithOverrides = buildGetModelWithOverrides(clientKeys, getEnv);

      // Optional system prompt override (playground-only feature).
      // Hard limits: 50–32 000 chars. Anything outside that range is rejected
      // rather than silently ignored so the UI surfaces the problem.
      const SYSTEM_PROMPT_MIN = 50;
      const SYSTEM_PROMPT_MAX = 32_000;
      let systemPromptOverride: string | undefined;
      if (typeof body.systemPromptOverride === "string") {
        const trimmed = body.systemPromptOverride;
        if (trimmed.length < SYSTEM_PROMPT_MIN || trimmed.length > SYSTEM_PROMPT_MAX) {
          return jsonResponse(400, {
            error: `systemPromptOverride must be ${SYSTEM_PROMPT_MIN}–${SYSTEM_PROMPT_MAX} characters`,
          });
        }
        systemPromptOverride = trimmed;
      } else if (body.systemPromptOverride !== undefined) {
        return jsonResponse(400, { error: "systemPromptOverride must be a string" });
      }

      const effectiveSystemPrompt = systemPromptOverride ?? SYSTEM_PROMPT;

      try {
        // No usageContext → maybeRecordUsage in _shared/llm.ts skips the DB write
        const result = await generate(
          notes,
          {
            provider: requestProvider,
            model: requestModel,
            getModelFn: getModelWithOverrides,
            systemPromptOverride,
          },
        );

        return jsonResponse(200, {
          report: result.report.report,
          usage: result.usage,
          provider: result.provider,
          model: result.model,
          systemPrompt: effectiveSystemPrompt,
          systemPromptIsOverride: systemPromptOverride !== undefined,
          serverProviders: getAvailableProviders(),
        });
      } catch (err) {
        console.error("playground generate error:", err);
        const message = err instanceof Error ? err.message : "Unknown error";
        const isParseError =
          err instanceof Error && err.constructor.name === "LLMParseError";
        return jsonResponse(isParseError ? 502 : 500, {
          error: isParseError ? "LLM returned invalid JSON" : message,
          ...(isParseError ? { code: "LLM_PARSE_ERROR" } : {}),
        });
      }
    } catch (outerErr) {
      console.error("playground UNHANDLED error:", outerErr);
      return jsonResponse(500, {
        error: outerErr instanceof Error ? outerErr.message : "Unhandled error",
      });
    }
  };
}

// ---------------------------------------------------------------------------
// Server entry point — wires the handler with module-level singletons.
// ---------------------------------------------------------------------------

const handler = createHandler({
  expectedKey: Deno.env.get("REVIEW_ACCESS_KEY") ?? "",
  rateLimitState: new Map(),
});

Deno.serve(handler);
