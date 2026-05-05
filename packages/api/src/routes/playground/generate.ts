/**
 * POST /v1/playground/generate
 *
 * Public-ish playground endpoint. Caller-supplied LLM API key (no
 * server bills). Gated by:
 *   - Header `x-playground-key` (constant-time compared to REVIEW_ACCESS_KEY)
 *   - Per-IP rate limit (30 req/min, sliding window)
 *
 * Body:
 *   { notes: string[], provider: string, model?: string, apiKey: string,
 *     systemPromptOverride?: string }
 *
 * Note: this route does NOT use the auth middleware — it has its own
 * gate via the playground key.
 */
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { timingSafeEqual } from "node:crypto";

import {
  generateReport,
  LLMParseError,
} from "../../services/ai/generate-report.js";
import { rateLimit } from "../../middleware/rate-limit.js";

const PLAYGROUND_RATE_LIMIT = { max: 30, windowMs: 60_000 } as const;

const bodySchema = z.object({
  notes: z.array(z.string().min(1)).min(1).max(200),
  provider: z.string().min(1),
  model: z.string().min(1).optional(),
  apiKey: z.string().min(1),
  systemPromptOverride: z.string().min(1).optional(),
});

export interface PlaygroundRouteDeps {
  readonly generateReportFn?: typeof generateReport;
  /** Inject for tests; production reads REVIEW_ACCESS_KEY at request time. */
  readonly expectedKey?: () => string | undefined;
  readonly now?: () => number;
}

function constantTimeEq(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export function createPlaygroundRoutes(
  deps: PlaygroundRouteDeps = {},
): Hono {
  const app = new Hono();

  // Rate limit applies to all playground traffic.
  app.use(
    "*",
    rateLimit({
      ...PLAYGROUND_RATE_LIMIT,
      ...(deps.now !== undefined && { now: deps.now }),
    }),
  );

  app.post("/generate", async (c) => {
    const expectedKey =
      (deps.expectedKey ?? (() => process.env["REVIEW_ACCESS_KEY"]))();
    if (!expectedKey) {
      throw new HTTPException(500, {
        message: "Server not configured — REVIEW_ACCESS_KEY missing",
      });
    }
    const provided = c.req.header("x-playground-key") ?? "";
    if (!provided || !constantTimeEq(provided, expectedKey)) {
      throw new HTTPException(401, { message: "Invalid access key" });
    }

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      throw new HTTPException(422, { message: "Body must be valid JSON" });
    }
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      throw new HTTPException(422, {
        message: "Invalid body",
        cause: parsed.error,
      });
    }

    // Caller-supplied API key: temporarily set the matching env var so
    // the AI SDK adapter picks it up. Restored after the call.
    const provider = parsed.data.provider.toLowerCase();
    const envKey = providerEnvKey(provider);
    if (!envKey) {
      throw new HTTPException(422, {
        message: `Unknown provider: ${provider}`,
      });
    }

    const previousValue = process.env[envKey];
    process.env[envKey] = parsed.data.apiKey;

    try {
      const result = await (deps.generateReportFn ?? generateReport)(
        parsed.data.notes,
        {
          provider,
          ...(parsed.data.model !== undefined && { model: parsed.data.model }),
          ...(parsed.data.systemPromptOverride !== undefined && {
            systemPromptOverride: parsed.data.systemPromptOverride,
          }),
        },
      );
      return c.json({
        report: result.report,
        usage: result.usage,
        provider: result.provider,
        model: result.model,
      });
    } catch (err) {
      if (err instanceof LLMParseError) {
        throw new HTTPException(502, {
          message: "Upstream model returned malformed JSON",
        });
      }
      if (err instanceof Error && /Unknown provider/.test(err.message)) {
        throw new HTTPException(422, { message: err.message });
      }
      throw err;
    } finally {
      if (previousValue === undefined) {
        delete process.env[envKey];
      } else {
        process.env[envKey] = previousValue;
      }
    }
  });

  return app;
}

const PROVIDER_ENV_KEY: Record<string, string> = {
  kimi: "MOONSHOT_API_KEY",
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  google: "GOOGLE_AI_API_KEY",
  zai: "ZAI_API_KEY",
  deepseek: "DEEPSEEK_API_KEY",
};

function providerEnvKey(provider: string): string | undefined {
  return PROVIDER_ENV_KEY[provider];
}
