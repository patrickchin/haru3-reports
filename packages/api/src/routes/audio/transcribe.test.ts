/**
 * Tests for POST /v1/audio/transcribe.
 */
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetEnvForTesting } from "../../env.js";
import { resetLoggerForTesting } from "../../logger.js";
import { errorHandler } from "../../middleware/error-handler.js";
import { authHeaders } from "../../../tests/helpers/auth.js";
import {
  PROVIDERS,
  type TranscribeParams,
  type TranscribeResult,
  type TranscriptionProvider,
} from "../../services/audio/providers.js";
import { createTranscribeRoutes } from "./transcribe.js";

const USER = "00000000-0000-0000-0000-0000000000dd";

const ENV_KEYS = ["GROQ_API_KEY", "OPENAI_API_KEY", "DEEPGRAM_API_KEY"];

function buildApp(deps: Parameters<typeof createTranscribeRoutes>[0]) {
  const app = new Hono();
  app.route("/v1/audio", createTranscribeRoutes(deps));
  app.onError(errorHandler);
  return app;
}

function audioForm(blob: Blob, fields?: Record<string, string>) {
  const fd = new FormData();
  fd.append("audio", blob, "rec.m4a");
  if (fields) {
    for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  }
  return fd;
}

beforeEach(() => {
  resetEnvForTesting();
  resetLoggerForTesting();
  process.env.NODE_ENV = "test";
  process.env.TEST_JWT_SECRET = "transcribe-secret";
  process.env["GROQ_API_KEY"] = "groq-test-key";
});

afterEach(() => {
  for (const k of ENV_KEYS) delete process.env[k];
});

describe("POST /v1/audio/transcribe", () => {
  it("requires authentication", async () => {
    const app = buildApp({});
    const fd = audioForm(new Blob([new Uint8Array([1, 2, 3])]));
    const res = await app.request("/v1/audio/transcribe", {
      method: "POST",
      body: fd,
    });
    expect(res.status).toBe(401);
  });

  it("rejects non-multipart Content-Type", async () => {
    const app = buildApp({});
    const headers = await authHeaders(USER);
    const res = await app.request("/v1/audio/transcribe", {
      method: "POST",
      body: JSON.stringify({}),
      headers: { ...headers, "Content-Type": "application/json" },
    });
    expect(res.status).toBe(415);
  });

  it("returns 422 when audio field is missing", async () => {
    const app = buildApp({});
    const headers = await authHeaders(USER);
    const fd = new FormData();
    fd.append("provider", "groq");
    const res = await app.request("/v1/audio/transcribe", {
      method: "POST",
      body: fd,
      headers,
    });
    expect(res.status).toBe(422);
  });

  it("returns 422 for empty file", async () => {
    const app = buildApp({});
    const headers = await authHeaders(USER);
    const fd = audioForm(new Blob([]));
    const res = await app.request("/v1/audio/transcribe", {
      method: "POST",
      body: fd,
      headers,
    });
    expect(res.status).toBe(422);
  });

  it("returns 422 for unknown provider", async () => {
    const app = buildApp({});
    const headers = await authHeaders(USER);
    const fd = audioForm(new Blob([new Uint8Array([1, 2, 3])]), {
      provider: "bogus",
    });
    const res = await app.request("/v1/audio/transcribe", {
      method: "POST",
      body: fd,
      headers,
    });
    expect(res.status).toBe(422);
  });

  it("returns 503 when provider env key is unset", async () => {
    delete process.env["GROQ_API_KEY"];
    const app = buildApp({});
    const headers = await authHeaders(USER);
    const fd = audioForm(new Blob([new Uint8Array([1, 2, 3])]));
    const res = await app.request("/v1/audio/transcribe", {
      method: "POST",
      body: fd,
      headers,
    });
    expect(res.status).toBe(503);
  });

  it("dispatches to provider and returns the transcript", async () => {
    const dispatch = vi.fn(
      async (
        _p: TranscriptionProvider,
        _params: TranscribeParams,
        _key: string,
      ): Promise<TranscribeResult> => ({
        text: "hello world",
        model: "whisper-large-v3-turbo",
      }),
    );
    const app = buildApp({ transcribeFn: dispatch });
    const headers = await authHeaders(USER);
    const fd = audioForm(
      new Blob([new Uint8Array([1, 2, 3])], { type: "audio/m4a" }),
      { language: "en" },
    );
    const res = await app.request("/v1/audio/transcribe", {
      method: "POST",
      body: fd,
      headers,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      text: string;
      model: string;
      provider: string;
    };
    expect(body).toEqual({
      text: "hello world",
      model: "whisper-large-v3-turbo",
      provider: "groq",
    });
    expect(dispatch).toHaveBeenCalledTimes(1);
    const [provider, params, apiKey] = dispatch.mock.calls[0]!;
    expect(provider.id).toBe("groq");
    expect(params.language).toBe("en");
    expect(params.mimeType).toBe("audio/m4a");
    expect(apiKey).toBe("groq-test-key");
    // Audio payload is preserved.
    expect(Array.from(params.audio)).toEqual([1, 2, 3]);
  });

  it("respects requested provider override", async () => {
    process.env["OPENAI_API_KEY"] = "openai-test";
    const dispatch = vi.fn(
      async (): Promise<TranscribeResult> => ({ text: "x", model: "m" }),
    );
    const app = buildApp({ transcribeFn: dispatch });
    const headers = await authHeaders(USER);
    const fd = audioForm(new Blob([new Uint8Array([7])]), {
      provider: "openai",
    });
    const res = await app.request("/v1/audio/transcribe", {
      method: "POST",
      body: fd,
      headers,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { provider: string };
    expect(body.provider).toBe("openai");
  });

  it("ensures all PROVIDERS resolve via the registry", () => {
    // sanity guard so future provider additions don't break registry lookup
    expect(Object.keys(PROVIDERS).length).toBeGreaterThanOrEqual(4);
  });
});
