import { getKey, clearKey, getProviderKeys } from "./access";
import { normalizeGeneratedReportPayload, type GeneratedSiteReport } from "./generated-report";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/generate-report-playground`;

export class InvalidKeyError extends Error {
  constructor() {
    super("Invalid access key");
    this.name = "InvalidKeyError";
  }
}

export class RateLimitError extends Error {
  constructor() {
    super("Rate limit exceeded — try again in a minute");
    this.name = "RateLimitError";
  }
}

export interface PlaygroundRequestBody {
  notes: string[];
  provider?: string;
  existingReport?: GeneratedSiteReport | null;
  lastProcessedNoteCount?: number;
  providerKeys?: Record<string, string>;
}

export interface PlaygroundResponse {
  report: GeneratedSiteReport;
  usage: { inputTokens: number; outputTokens: number; cachedTokens: number } | null;
  provider: string;
  model: string;
  systemPrompt: string | null;
  serverProviders: string[];
}

export async function callPlaygroundFunction(
  body: PlaygroundRequestBody,
): Promise<PlaygroundResponse> {
  const key = getKey();
  const providerKeys = getProviderKeys();
  const hasClientKeys = Object.values(providerKeys).some((v) => v?.trim());

  const response = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
      "x-playground-key": key,
    },
    body: JSON.stringify({
      ...body,
      ...(hasClientKeys ? { providerKeys } : {}),
    }),
  });

  if (response.status === 401) {
    clearKey();
    throw new InvalidKeyError();
  }

  if (response.status === 429) {
    throw new RateLimitError();
  }

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(
      (err as { error?: string }).error ?? `HTTP ${response.status}`,
    );
  }

  const data = await response.json();

  // The edge function returns { report: { meta, weather, ... }, usage, provider, model }
  // Wrap in the expected shape for normalization
  const normalized = normalizeGeneratedReportPayload({ report: data.report });
  if (!normalized) {
    throw new Error("Response does not match the expected report schema");
  }

  return {
    report: normalized,
    usage: data.usage ?? null,
    provider: data.provider ?? "unknown",
    model: data.model ?? "unknown",
    systemPrompt: data.systemPrompt ?? null,
    serverProviders: Array.isArray(data.serverProviders) ? data.serverProviders : [],
  };
}

export async function fetchServerProviders(): Promise<string[]> {
  const key = getKey();
  try {
    const response = await fetch(FUNCTION_URL, {
      method: "GET",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        "x-playground-key": key,
      },
    });
    if (!response.ok) return [];
    const data = await response.json();
    return Array.isArray(data.serverProviders) ? data.serverProviders : [];
  } catch {
    return [];
  }
}

/**
 * Validate a playground access key against the edge function.
 * Returns { ok: true, serverProviders } on success, { ok: false } on 401.
 * Throws on network / unexpected errors.
 */
export async function validatePlaygroundKey(
  key: string,
): Promise<
  | { ok: true; serverProviders: string[] }
  | { ok: false; reason: "invalid" | "rate_limited" | "server" }
> {
  const response = await fetch(FUNCTION_URL, {
    method: "GET",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      "x-playground-key": key,
    },
  });

  if (response.status === 401) return { ok: false, reason: "invalid" };
  if (response.status === 429) return { ok: false, reason: "rate_limited" };
  if (!response.ok) return { ok: false, reason: "server" };

  const data = await response.json().catch(() => ({}));
  return {
    ok: true,
    serverProviders: Array.isArray(data.serverProviders) ? data.serverProviders : [],
  };
}
