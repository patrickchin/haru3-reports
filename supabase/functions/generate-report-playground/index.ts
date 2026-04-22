import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  generateReportFromNotes,
  isValidNotes,
  VALID_PROVIDERS,
  getModel as defaultGetModel,
  getAvailableProviders,
  corsHeaders as baseCorsHeaders,
  SYSTEM_PROMPT,
} from "../generate-report/index.ts";
import type { GeneratedSiteReport } from "../generate-report/report-schema.ts";
import { createOpenAICompatible } from "npm:@ai-sdk/openai-compatible";
import { createOpenAI } from "npm:@ai-sdk/openai";
import { createAnthropic } from "npm:@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "npm:@ai-sdk/google";

// ---------------------------------------------------------------------------
// CORS — allow the x-playground-key header in addition to standard headers
// ---------------------------------------------------------------------------

const corsHeaders: Record<string, string> = {
  ...baseCorsHeaders,
  "Access-Control-Allow-Headers":
    `${baseCorsHeaders["Access-Control-Allow-Headers"]}, x-playground-key`,
};

// ---------------------------------------------------------------------------
// Access key validation (timing-safe)
// ---------------------------------------------------------------------------

const EXPECTED_KEY = Deno.env.get("REVIEW_ACCESS_KEY") ?? "";

function timingSafeEqual(a: string, b: string): boolean {
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

function validateKey(req: Request): Response | null {
  if (!EXPECTED_KEY) {
    return jsonResponse(
      500,
      { error: "Server not configured — REVIEW_ACCESS_KEY is missing" },
    );
  }

  const provided = req.headers.get("x-playground-key") ?? "";
  if (!provided || !timingSafeEqual(provided, EXPECTED_KEY)) {
    return jsonResponse(401, { error: "Invalid access key" });
  }

  return null;
}

// ---------------------------------------------------------------------------
// Rate limiting (in-memory, per-IP, resets on cold start)
// ---------------------------------------------------------------------------

const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_MS = 60_000;

const rateLimitMap = new Map<string, { count: number; windowStart: number }>();

function checkRateLimit(req: Request): Response | null {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("cf-connecting-ip") ??
    "unknown";

  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(ip, { count: 1, windowStart: now });
    return null;
  }

  entry.count++;
  if (entry.count > RATE_LIMIT_MAX) {
    return jsonResponse(429, { error: "Rate limit exceeded — try again in a minute" });
  }

  return null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  try {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // GET — return which providers have server-side keys
  if (req.method === "GET") {
    const keyErr = validateKey(req);
    if (keyErr) return keyErr;
    return jsonResponse(200, { serverProviders: getAvailableProviders() });
  }

  // Only POST allowed
  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  // Gate: access key
  const keyErr = validateKey(req);
  if (keyErr) return keyErr;

  // Gate: rate limit
  const rateErr = checkRateLimit(req);
  if (rateErr) return rateErr;

  // Parse body
  let body: {
    notes?: unknown;
    provider?: unknown;
    existingReport?: unknown;
    lastProcessedNoteCount?: unknown;
    providerKeys?: unknown;
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

  // Resolve optional parameters
  const existingReport: GeneratedSiteReport | null =
    typeof body.existingReport === "object" &&
    body.existingReport !== null &&
    typeof (body.existingReport as Record<string, unknown>).report === "object"
      ? (body.existingReport as GeneratedSiteReport)
      : null;

  const lastProcessedNoteCount: number | undefined =
    typeof body.lastProcessedNoteCount === "number" &&
    Number.isInteger(body.lastProcessedNoteCount) &&
    body.lastProcessedNoteCount >= 0
      ? body.lastProcessedNoteCount
      : undefined;

  const requestProvider: string | undefined =
    typeof body.provider === "string" &&
    VALID_PROVIDERS.includes(
      body.provider.toLowerCase() as (typeof VALID_PROVIDERS)[number],
    )
      ? body.provider.toLowerCase()
      : undefined;

  // Build getModelFn that uses client-provided keys as overrides
  const clientKeys: Record<string, string> = {};
  if (body.providerKeys && typeof body.providerKeys === "object" && !Array.isArray(body.providerKeys)) {
    for (const [k, v] of Object.entries(body.providerKeys as Record<string, unknown>)) {
      if (typeof v === "string" && v.trim()) clientKeys[k] = v.trim();
    }
  }

  const getModelWithOverrides = (provider: string) => {
    const envMap: Record<string, string> = {
      kimi: "MOONSHOT_API_KEY",
      openai: "OPENAI_API_KEY",
      anthropic: "ANTHROPIC_API_KEY",
      google: "GOOGLE_AI_API_KEY",
    };
    const clientKey = clientKeys[provider];
    const envKey = Deno.env.get(envMap[provider] ?? "");
    const apiKey = clientKey || envKey;

    if (!apiKey) return defaultGetModel(provider); // will throw "key not set"

    switch (provider) {
      case "openai":
        return { instance: createOpenAI({ apiKey })("gpt-4o-mini"), modelId: "gpt-4o-mini" };
      case "anthropic":
        return { instance: createAnthropic({ apiKey })("claude-sonnet-4-20250514"), modelId: "claude-sonnet-4-20250514" };
      case "google":
        return { instance: createGoogleGenerativeAI({ apiKey })("gemini-2.0-flash"), modelId: "gemini-2.0-flash" };
      case "kimi":
      default:
        return {
          instance: createOpenAICompatible({ name: "kimi", baseURL: "https://api.moonshot.cn/v1", apiKey })("kimi-k2-0711-preview"),
          modelId: "kimi-k2-0711-preview",
        };
    }
  };

  try {
    // No usageContext → maybeRecordUsage in _shared/llm.ts skips the DB write
    const result = await generateReportFromNotes(
      notes,
      { provider: requestProvider, getModelFn: getModelWithOverrides },
      existingReport,
      lastProcessedNoteCount,
    );

    return jsonResponse(200, {
      report: result.report.report,
      usage: result.usage,
      provider: result.provider,
      model: result.model,
      systemPrompt: SYSTEM_PROMPT,
      serverProviders: getAvailableProviders(),
    });
  } catch (err) {
    console.error("playground generate error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    const isParseError = err?.constructor?.name === "LLMParseError";
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
});
