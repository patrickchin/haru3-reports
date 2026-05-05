/**
 * Tests for POST /v1/playground/generate.
 */
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { errorHandler } from "../../middleware/error-handler.js";
import {
  LLMParseError,
  type GenerateResult,
  type generateReport as GenerateReportFn,
} from "../../services/ai/generate-report.js";
import { createPlaygroundRoutes } from "./generate.js";

const PLAYGROUND_KEY = "test-playground-key";

const validResult: GenerateResult = {
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
  usage: null,
  provider: "kimi",
  model: "kimi-k2-0711-preview",
  systemPrompt: "",
  userPrompt: "",
};

function buildApp(stub?: typeof GenerateReportFn) {
  const app = new Hono();
  app.route(
    "/v1/playground",
    createPlaygroundRoutes({
      ...(stub !== undefined && { generateReportFn: stub }),
      expectedKey: () => PLAYGROUND_KEY,
    }),
  );
  app.onError(errorHandler);
  return app;
}

const validBody = {
  notes: ["walked the site"],
  provider: "kimi",
  apiKey: "user-supplied-key",
};

beforeEach(() => {
  // Ensure no stale env from other tests leaks in.
  delete process.env["MOONSHOT_API_KEY"];
});

afterEach(() => {
  delete process.env["MOONSHOT_API_KEY"];
});

describe("POST /v1/playground/generate", () => {
  it("returns 401 without x-playground-key", async () => {
    const app = buildApp(async () => validResult);
    const res = await app.request("/v1/playground/generate", {
      method: "POST",
      body: JSON.stringify(validBody),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(401);
  });

  it("returns 401 for wrong key", async () => {
    const app = buildApp(async () => validResult);
    const res = await app.request("/v1/playground/generate", {
      method: "POST",
      body: JSON.stringify(validBody),
      headers: {
        "Content-Type": "application/json",
        "x-playground-key": "wrong",
      },
    });
    expect(res.status).toBe(401);
  });

  it("returns 422 for invalid body", async () => {
    const app = buildApp(async () => validResult);
    const res = await app.request("/v1/playground/generate", {
      method: "POST",
      body: JSON.stringify({ notes: [] }),
      headers: {
        "Content-Type": "application/json",
        "x-playground-key": PLAYGROUND_KEY,
      },
    });
    expect(res.status).toBe(422);
  });

  it("returns 422 for unknown provider in body", async () => {
    const app = buildApp(async () => validResult);
    const res = await app.request("/v1/playground/generate", {
      method: "POST",
      body: JSON.stringify({ ...validBody, provider: "bogus" }),
      headers: {
        "Content-Type": "application/json",
        "x-playground-key": PLAYGROUND_KEY,
      },
    });
    expect(res.status).toBe(422);
  });

  it("calls generateReport with caller-supplied API key in env", async () => {
    let observedEnv: string | undefined;
    const stub = vi.fn(async (...args: Parameters<typeof GenerateReportFn>) => {
      observedEnv = process.env["MOONSHOT_API_KEY"];
      void args;
      return validResult;
    });
    const app = buildApp(stub as unknown as typeof GenerateReportFn);
    const res = await app.request("/v1/playground/generate", {
      method: "POST",
      body: JSON.stringify(validBody),
      headers: {
        "Content-Type": "application/json",
        "x-playground-key": PLAYGROUND_KEY,
      },
    });
    expect(res.status).toBe(200);
    expect(observedEnv).toBe("user-supplied-key");
    // env restored after the call
    expect(process.env["MOONSHOT_API_KEY"]).toBeUndefined();
  });

  it("maps LLMParseError to 502", async () => {
    const app = buildApp((async () => {
      throw new LLMParseError("garbage", new Error("bad"));
    }) as unknown as typeof GenerateReportFn);
    const res = await app.request("/v1/playground/generate", {
      method: "POST",
      body: JSON.stringify(validBody),
      headers: {
        "Content-Type": "application/json",
        "x-playground-key": PLAYGROUND_KEY,
      },
    });
    expect(res.status).toBe(502);
  });

  it("rate-limits at 30 req/min per IP", async () => {
    let t = 0;
    const app = new Hono();
    app.route(
      "/v1/playground",
      createPlaygroundRoutes({
        generateReportFn: (async () => validResult) as unknown as typeof GenerateReportFn,
        expectedKey: () => PLAYGROUND_KEY,
        now: () => t,
      }),
    );
    app.onError(errorHandler);

    const headers = {
      "Content-Type": "application/json",
      "x-playground-key": PLAYGROUND_KEY,
      "x-forwarded-for": "9.9.9.9",
    };
    for (let i = 0; i < 30; i++) {
      const res = await app.request("/v1/playground/generate", {
        method: "POST",
        body: JSON.stringify(validBody),
        headers,
      });
      expect(res.status, `req ${i + 1}`).toBe(200);
    }
    const limited = await app.request("/v1/playground/generate", {
      method: "POST",
      body: JSON.stringify(validBody),
      headers,
    });
    expect(limited.status).toBe(429);
  });
});
