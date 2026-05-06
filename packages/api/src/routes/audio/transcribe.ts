/**
 * POST /v1/audio/transcribe — multipart upload of an audio file.
 *
 * form-data:
 *   audio:    File (audio binary)
 *   provider: string?  (overrides TRANSCRIPTION_PROVIDER env)
 *   language: string?  (BCP-47 hint, e.g. "en")
 *
 * Field name is `audio` to match the legacy `transcribe-audio` edge
 * function and existing mobile clients.
 *
 * Response: { text, model, provider }
 *
 * Ported from `supabase/functions/transcribe-audio/index.ts`. Auth is
 * already handled by `authMiddleware`; here we only need to parse the
 * upload, resolve the provider, dispatch, and return.
 */
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";

import { authMiddleware, type AuthVariables } from "../../middleware/auth.js";
import {
  resolveProvider,
  type TranscribeResult,
  type TranscribeParams,
  type TranscriptionProvider,
} from "../../services/audio/providers.js";

const MAX_BYTES = 25 * 1024 * 1024; // 25MB — matches OpenAI/Groq limits.

export interface TranscribeRouteDeps {
  /** Override provider resolution + dispatch (for tests). */
  readonly transcribeFn?: (
    provider: TranscriptionProvider,
    params: TranscribeParams,
    apiKey: string,
  ) => Promise<TranscribeResult>;
  readonly resolveProviderFn?: typeof resolveProvider;
}

export function createTranscribeRoutes(
  deps: TranscribeRouteDeps = {},
): Hono<{ Variables: AuthVariables }> {
  const app = new Hono<{ Variables: AuthVariables }>();

  app.use("*", authMiddleware());

  app.post("/transcribe", async (c) => {
    const contentType = c.req.header("content-type") ?? "";
    if (!contentType.toLowerCase().includes("multipart/form-data")) {
      throw new HTTPException(415, {
        message: "Content-Type must be multipart/form-data",
      });
    }

    let form: FormData;
    try {
      form = await c.req.formData();
    } catch {
      throw new HTTPException(422, { message: "Could not parse form-data" });
    }

    const file = form.get("audio");
    if (!(file instanceof File)) {
      throw new HTTPException(422, { message: "Missing 'audio' field" });
    }
    if (file.size === 0) {
      throw new HTTPException(422, { message: "Uploaded file is empty" });
    }
    if (file.size > MAX_BYTES) {
      throw new HTTPException(413, {
        message: `File too large (max ${MAX_BYTES} bytes)`,
      });
    }

    const requestedProvider = formString(form, "provider");
    const language = formString(form, "language");

    let provider: TranscriptionProvider;
    try {
      provider = (deps.resolveProviderFn ?? resolveProvider)(requestedProvider);
    } catch (err) {
      throw new HTTPException(422, {
        message: err instanceof Error ? err.message : "Unknown provider",
      });
    }

    const apiKey = process.env[provider.envKey];
    if (!apiKey) {
      throw new HTTPException(503, {
        message: `Provider unavailable: ${provider.envKey} not set`,
      });
    }

    const audio = new Uint8Array(await file.arrayBuffer());
    const params: TranscribeParams = {
      audio,
      mimeType: file.type || "application/octet-stream",
      filename: file.name || "upload",
      ...(language !== undefined && { language }),
    };

    const dispatch = deps.transcribeFn ?? ((p, par, key) => p.transcribe(par, key));
    const result = await dispatch(provider, params, apiKey);

    return c.json({
      text: result.text,
      model: result.model,
      provider: provider.id,
    });
  });

  return app;
}

function formString(form: FormData, key: string): string | undefined {
  const v = form.get(key);
  if (typeof v === "string" && v.trim() !== "") return v;
  return undefined;
}
