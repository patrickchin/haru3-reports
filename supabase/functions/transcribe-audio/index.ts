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
