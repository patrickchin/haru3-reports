/**
 * Tests for POST /v1/reports/generate.
 */
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../app.js";
import { resetEnvForTesting } from "../../env.js";
import { resetLoggerForTesting } from "../../logger.js";
import { errorHandler } from "../../middleware/error-handler.js";
import { authHeaders } from "../../../tests/helpers/auth.js";
import type { Sql } from "../../db/sql.js";
import {
  LLMParseError,
  type GenerateResult,
  type generateReport as GenerateReportFn,
} from "../../services/ai/generate-report.js";
import { createReportsGenerateRoutes } from "./generate.js";

const USER = "00000000-0000-0000-0000-0000000000cc";

function fakeSql(): Sql {
  const sql = ((_s: TemplateStringsArray, ..._v: unknown[]) =>
    Promise.resolve([])) as unknown as Sql;
  return sql;
}

function buildAppWithStub(stub: typeof GenerateReportFn) {
  const app = new Hono();
  app.route(
    "/v1/reports",
    createReportsGenerateRoutes({
      getSql: fakeSql,
      generateReportFn: stub,
    }),
  );
  app.onError(errorHandler);
  return app;
}

beforeEach(() => {
  resetEnvForTesting();
  resetLoggerForTesting();
  process.env.NODE_ENV = "test";
  process.env.TEST_JWT_SECRET = "report-route-secret";
});

const validBody = { notes: ["walked the site"], provider: "kimi" };

describe("POST /v1/reports/generate", () => {
  it("requires authentication", async () => {
    const app = createApp({ getSql: fakeSql });
    const res = await app.request("/v1/reports/generate", {
      method: "POST",
      body: JSON.stringify(validBody),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(401);
  });

  it("returns 422 for empty notes", async () => {
    const app = createApp({ getSql: fakeSql });
    const headers = await authHeaders(USER);
    const res = await app.request("/v1/reports/generate", {
      method: "POST",
      body: JSON.stringify({ notes: [] }),
      headers: { ...headers, "Content-Type": "application/json" },
    });
    expect(res.status).toBe(422);
  });

  it("returns 422 for invalid JSON", async () => {
    const app = createApp({ getSql: fakeSql });
    const headers = await authHeaders(USER);
    const res = await app.request("/v1/reports/generate", {
      method: "POST",
      body: "{",
      headers: { ...headers, "Content-Type": "application/json" },
    });
    expect(res.status).toBe(422);
  });

  it("returns the generated report on success", async () => {
    const result: GenerateResult = {
      report: {
        report: {
          meta: {
            title: "T",
            reportType: "site_visit",
            summary: "s",
            visitDate: null,
          },
          weather: null,
          workers: null,
          materials: [],
          issues: [],
          nextSteps: [],
          sections: [],
        },
      },
      usage: { inputTokens: 1, outputTokens: 2, cachedTokens: 0 },
      provider: "kimi",
      model: "kimi-k2-0711-preview",
      systemPrompt: "S",
      userPrompt: "U",
    };
    const fn = vi.fn(async () => result);
    const app = buildAppWithStub(fn as unknown as typeof GenerateReportFn);
    const headers = await authHeaders(USER);
    const res = await app.request("/v1/reports/generate", {
      method: "POST",
      body: JSON.stringify(validBody),
      headers: { ...headers, "Content-Type": "application/json" },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { provider: string; model: string };
    expect(body.provider).toBe("kimi");
    expect(body.model).toBe("kimi-k2-0711-preview");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("maps LLMParseError to 502", async () => {
    const app = buildAppWithStub((async () => {
      throw new LLMParseError("garbage", new Error("bad"));
    }) as unknown as typeof GenerateReportFn);
    const headers = await authHeaders(USER);
    const res = await app.request("/v1/reports/generate", {
      method: "POST",
      body: JSON.stringify(validBody),
      headers: { ...headers, "Content-Type": "application/json" },
    });
    expect(res.status).toBe(502);
  });

  it("maps missing-env error to 503", async () => {
    const app = buildAppWithStub((async () => {
      throw new Error("OPENAI_API_KEY not set");
    }) as unknown as typeof GenerateReportFn);
    const headers = await authHeaders(USER);
    const res = await app.request("/v1/reports/generate", {
      method: "POST",
      body: JSON.stringify(validBody),
      headers: { ...headers, "Content-Type": "application/json" },
    });
    expect(res.status).toBe(503);
  });

  it("maps unknown provider to 422", async () => {
    const app = buildAppWithStub((async () => {
      throw new Error("Unknown provider: bogus");
    }) as unknown as typeof GenerateReportFn);
    const headers = await authHeaders(USER);
    const res = await app.request("/v1/reports/generate", {
      method: "POST",
      body: JSON.stringify(validBody),
      headers: { ...headers, "Content-Type": "application/json" },
    });
    expect(res.status).toBe(422);
  });
});
