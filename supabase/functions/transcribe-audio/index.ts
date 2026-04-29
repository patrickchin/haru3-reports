import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import * as jose from "jsr:@panva/jose@6";
import {
  listAvailableProviders,
  PROVIDERS,
  resolveProvider,
} from "./providers.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function getBearerToken(req: Request): string | null {
  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return null;
  return authHeader.slice("Bearer ".length).trim() || null;
}

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

async function resolveUserId(req: Request): Promise<string | null> {
  const token = getBearerToken(req);
  if (!token) return null;
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!supabaseUrl) return null;
  try {
    const payload = await verifySupabaseJwt(token, supabaseUrl);
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch (err) {
    console.error("transcribe-audio auth failed:", err);
    return null;
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const DEFAULT_FIXTURES_DELAY_MS = 5000;
const FIXTURE_TRANSCRIPT = "Mocked voice note for E2E";

async function sleepFromEnv(name: string, defaultMs: number): Promise<void> {
  const raw = Deno.env.get(name);
  const ms = raw === undefined ? defaultMs : Number.parseInt(raw, 10);
  if (!Number.isFinite(ms) || ms <= 0) return;
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method === "GET") {
    return jsonResponse({
      providers: listAvailableProviders(),
      all: Object.keys(PROVIDERS),
      default: (Deno.env.get("TRANSCRIPTION_PROVIDER") ?? "groq").toLowerCase(),
    });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "method not allowed" }, 405);
  }

  try {
    const userId = await resolveUserId(req);
    if (!userId) {
      return jsonResponse({ error: "unauthorized" }, 401);
    }

    const contentType = req.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      return jsonResponse(
        { error: "expected multipart/form-data with 'audio' file" },
        400,
      );
    }

    const form = await req.formData();
    const file = form.get("audio");
    if (!(file instanceof File)) {
      return jsonResponse({ error: "'audio' form field must be a file" }, 400);
    }

    // USE_FIXTURES=true serves a canned transcript instead of calling a real
    // provider — mirrors the generate-report fixture mode so local Maestro /
    // manual fixture runs work without provider API keys. Auth, multipart
    // parsing, and the network round-trip all still happen.
    if (Deno.env.get("USE_FIXTURES") === "true") {
      const startMs = Date.now();
      await sleepFromEnv("FIXTURES_DELAY_MS", DEFAULT_FIXTURES_DELAY_MS);
      return jsonResponse({
        text: FIXTURE_TRANSCRIPT,
        provider: "fixture",
        model: "fixture-stub",
        durationMs: Date.now() - startMs,
      });
    }

    const requestedProvider = form.get("provider");
    const language = form.get("language");

    const provider = resolveProvider(
      typeof requestedProvider === "string" ? requestedProvider : null,
    );

    const apiKey = Deno.env.get(provider.envKey);
    if (!apiKey) {
      return jsonResponse(
        {
          error:
            `provider "${provider.id}" is not configured (missing ${provider.envKey})`,
        },
        503,
      );
    }

    const audioBytes = new Uint8Array(await file.arrayBuffer());
    const mimeType = file.type || "audio/m4a";
    const filename = file.name || "audio.m4a";

    const startMs = Date.now();
    const result = await provider.transcribe(
      {
        audio: audioBytes,
        mimeType,
        filename,
        language: typeof language === "string" && language ? language : undefined,
      },
      apiKey,
    );
    const durationMs = Date.now() - startMs;

    return jsonResponse({
      text: result.text,
      provider: provider.id,
      model: result.model,
      durationMs,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("transcribe-audio error:", message);
    return jsonResponse({ error: message }, 500);
  }
});
