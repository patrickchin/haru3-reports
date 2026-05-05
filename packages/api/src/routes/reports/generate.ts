/**
 * POST /v1/reports/generate
 *
 * Body:
 *   { notes: string[], provider?: string, model?: string, projectId?: string|null }
 * Response:
 *   { report, usage, provider, model }
 */
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";

import { authMiddleware, type AuthVariables } from "../../middleware/auth.js";
import {
  generateReport,
  LLMParseError,
  type GenerateReportDeps,
} from "../../services/ai/generate-report.js";
import { makeRecordUsage } from "../../services/ai/llm.js";
import type { Sql } from "../../services/sync-pull.js";

const bodySchema = z.object({
  notes: z.array(z.string().min(1)).min(1).max(200),
  provider: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
  projectId: z.string().uuid().nullable().optional(),
});

export interface GenerateReportRouteDeps {
  readonly getSql: () => Sql;
  /** Override AI orchestration for tests / fixture mode. */
  readonly generateReportFn?: typeof generateReport;
}

export function createReportsGenerateRoutes(
  deps: GenerateReportRouteDeps,
): Hono<{ Variables: AuthVariables }> {
  const app = new Hono<{ Variables: AuthVariables }>();

  app.use("*", authMiddleware());

  app.post("/generate", async (c) => {
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

    const userId = c.get("userId");
    const orchestrate = deps.generateReportFn ?? generateReport;

    const orchestrationDeps: GenerateReportDeps = {
      ...(parsed.data.provider !== undefined && {
        provider: parsed.data.provider,
      }),
      ...(parsed.data.model !== undefined && { model: parsed.data.model }),
      usageContext: {
        userId,
        projectId: parsed.data.projectId ?? null,
      },
      recordUsageFn: makeRecordUsage(deps.getSql()),
    };

    try {
      const result = await orchestrate(parsed.data.notes, orchestrationDeps);
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
      if (err instanceof Error && /not set/.test(err.message)) {
        // Missing provider env key — config error, not the caller's fault.
        throw new HTTPException(503, {
          message: `Provider unavailable: ${err.message}`,
        });
      }
      if (err instanceof Error && /Unknown provider/.test(err.message)) {
        throw new HTTPException(422, { message: err.message });
      }
      throw err;
    }
  });

  return app;
}
