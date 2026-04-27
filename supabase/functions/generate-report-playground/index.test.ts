/**
 * Tests for `generate-report-playground/index.ts`.
 *
 * Targets:
 *   - timingSafeEqual: equal-length comparison + length mismatch.
 *   - validateKey: missing server key (500), missing/invalid client key (401),
 *     valid key (passes through).
 *   - checkRateLimit: under-limit / over-limit / window reset.
 *   - createHandler: full request pipeline — OPTIONS preflight, GET catalogue,
 *     method-not-allowed, body parsing (invalid JSON, invalid notes),
 *     provider/model validation, parse-error mapping (LLMParseError → 502),
 *     generic errors → 500, and the success path with mocked
 *     `generateReportFromNotes`.
 */
import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "jsr:@std/assert";
import {
  buildGetModelWithOverrides,
  checkRateLimit,
  corsHeaders,
  createHandler,
  RATE_LIMIT_MAX,
  RATE_LIMIT_WINDOW_MS,
  timingSafeEqual,
  validateKey,
} from "./index.ts";

// ── Helpers ───────────────────────────────────────────────────

function makeReq(opts: {
  method?: string;
  url?: string;
  headers?: Record<string, string>;
  body?: BodyInit | null;
} = {}): Request {
  return new Request(opts.url ?? "https://fn.test/", {
    method: opts.method ?? "GET",
    headers: opts.headers,
    body: opts.body,
  });
}

async function readJson(res: Response): Promise<unknown> {
  return await res.json();
}

// ── timingSafeEqual ───────────────────────────────────────────

Deno.test("timingSafeEqual returns true for equal strings", () => {
  assertEquals(timingSafeEqual("abc-123", "abc-123"), true);
  assertEquals(timingSafeEqual("", ""), true);
});

Deno.test("timingSafeEqual returns false for different content of equal length", () => {
  assertEquals(timingSafeEqual("abc-123", "abc-124"), false);
});

Deno.test("timingSafeEqual returns false for different lengths (no early-leak via comparison)", () => {
  assertEquals(timingSafeEqual("abc", "abcd"), false);
  assertEquals(timingSafeEqual("longer", "x"), false);
});

// ── validateKey ───────────────────────────────────────────────

Deno.test("validateKey returns 500 when expectedKey is empty", async () => {
  const res = validateKey(makeReq({ headers: { "x-playground-key": "anything" } }), {
    expectedKey: "",
  });
  assert(res);
  assertEquals(res!.status, 500);
  const body = await readJson(res!) as { error: string };
  assertStringIncludes(body.error, "REVIEW_ACCESS_KEY");
});

Deno.test("validateKey returns 401 when the header is missing", async () => {
  const res = validateKey(makeReq(), { expectedKey: "secret" });
  assert(res);
  assertEquals(res!.status, 401);
  const body = await readJson(res!) as { error: string };
  assertEquals(body.error, "Invalid access key");
});

Deno.test("validateKey returns 401 when the header is wrong", async () => {
  const res = validateKey(
    makeReq({ headers: { "x-playground-key": "wrong" } }),
    { expectedKey: "secret" },
  );
  assertEquals(res!.status, 401);
});

Deno.test("validateKey returns null (pass-through) when the header matches", () => {
  const res = validateKey(
    makeReq({ headers: { "x-playground-key": "secret" } }),
    { expectedKey: "secret" },
  );
  assertEquals(res, null);
});

// ── checkRateLimit ────────────────────────────────────────────

Deno.test("checkRateLimit allows the first request and seeds the window", () => {
  const state = new Map();
  const now = () => 1000;
  const res = checkRateLimit(
    makeReq({ headers: { "x-forwarded-for": "1.2.3.4" } }),
    { state, now },
  );
  assertEquals(res, null);
  assertEquals(state.get("1.2.3.4"), { count: 1, windowStart: 1000 });
});

Deno.test(
  "checkRateLimit allows up to RATE_LIMIT_MAX requests then 429s the (max+1)-th",
  async () => {
    const state = new Map();
    const now = () => 1000;
    const headers = { "x-forwarded-for": "1.2.3.4" };

    // First request seeds the window with count=1.
    assertEquals(checkRateLimit(makeReq({ headers }), { state, now }), null);
    // Subsequent requests increment until they hit the cap.
    for (let i = 2; i <= RATE_LIMIT_MAX; i++) {
      assertEquals(checkRateLimit(makeReq({ headers }), { state, now }), null);
    }
    // The (RATE_LIMIT_MAX + 1)-th request must 429.
    const blocked = checkRateLimit(makeReq({ headers }), { state, now });
    assert(blocked);
    assertEquals(blocked!.status, 429);
    const body = await readJson(blocked!) as { error: string };
    assertStringIncludes(body.error, "Rate limit");
  },
);

Deno.test("checkRateLimit resets the window after RATE_LIMIT_WINDOW_MS", () => {
  const state = new Map();
  const headers = { "x-forwarded-for": "1.2.3.4" };

  let nowVal = 1000;
  const now = () => nowVal;
  for (let i = 0; i < RATE_LIMIT_MAX; i++) {
    checkRateLimit(makeReq({ headers }), { state, now });
  }
  // Advance just past the window boundary — counter resets.
  nowVal = 1000 + RATE_LIMIT_WINDOW_MS + 1;
  const res = checkRateLimit(makeReq({ headers }), { state, now });
  assertEquals(res, null);
  assertEquals(state.get("1.2.3.4"), {
    count: 1,
    windowStart: 1000 + RATE_LIMIT_WINDOW_MS + 1,
  });
});

Deno.test("checkRateLimit isolates IPs from each other", () => {
  const state = new Map();
  const now = () => 1000;
  // Burn through limit on one IP.
  for (let i = 0; i <= RATE_LIMIT_MAX; i++) {
    checkRateLimit(
      makeReq({ headers: { "x-forwarded-for": "1.1.1.1" } }),
      { state, now },
    );
  }
  // Other IP must still be allowed.
  const res = checkRateLimit(
    makeReq({ headers: { "x-forwarded-for": "2.2.2.2" } }),
    { state, now },
  );
  assertEquals(res, null);
});

Deno.test(
  "checkRateLimit falls back to 'unknown' when no IP headers are present",
  () => {
    const state = new Map();
    const res = checkRateLimit(makeReq(), { state, now: () => 1000 });
    assertEquals(res, null);
    assert(state.has("unknown"));
  },
);

// ── createHandler ─────────────────────────────────────────────

const VALID_KEY = "secret-key";

function makeHandler(overrides: Partial<Parameters<typeof createHandler>[0]> = {}) {
  return createHandler({
    expectedKey: VALID_KEY,
    rateLimitState: new Map(),
    now: () => 0,
    getEnv: () => undefined,
    ...overrides,
  });
}

Deno.test("createHandler — OPTIONS preflight returns 204 with CORS headers", async () => {
  const h = makeHandler();
  const res = await h(makeReq({ method: "OPTIONS" }));
  assertEquals(res.status, 204);
  assertEquals(
    res.headers.get("Access-Control-Allow-Origin"),
    corsHeaders["Access-Control-Allow-Origin"],
  );
  assertStringIncludes(
    res.headers.get("Access-Control-Allow-Headers") ?? "",
    "x-playground-key",
  );
});

Deno.test("createHandler — GET requires the access key", async () => {
  const h = makeHandler();
  const res = await h(makeReq({ method: "GET" }));
  assertEquals(res.status, 401);
});

Deno.test("createHandler — GET with valid key returns serverProviders + models", async () => {
  const h = makeHandler();
  const res = await h(makeReq({
    method: "GET",
    headers: { "x-playground-key": VALID_KEY },
  }));
  assertEquals(res.status, 200);
  const body = await readJson(res) as {
    serverProviders: string[];
    models: Record<string, unknown>;
  };
  assert(Array.isArray(body.serverProviders));
  assertEquals(typeof body.models, "object");
  // Catalogue must include the canonical provider keys.
  assert("kimi" in body.models);
  assert("openai" in body.models);
});

Deno.test("createHandler — non-GET/POST methods return 405", async () => {
  const h = makeHandler();
  for (const method of ["DELETE", "PATCH", "PUT"]) {
    const res = await h(makeReq({
      method,
      headers: { "x-playground-key": VALID_KEY },
    }));
    assertEquals(res.status, 405, `${method} should 405`);
  }
});

Deno.test("createHandler — POST without key returns 401", async () => {
  const h = makeHandler();
  const res = await h(makeReq({ method: "POST", body: "{}" }));
  assertEquals(res.status, 401);
});

Deno.test("createHandler — POST with invalid JSON returns 400", async () => {
  const h = makeHandler();
  const res = await h(makeReq({
    method: "POST",
    headers: { "x-playground-key": VALID_KEY, "content-type": "application/json" },
    body: "{not json",
  }));
  assertEquals(res.status, 400);
  const body = await readJson(res) as { error: string };
  assertEquals(body.error, "Invalid JSON body");
});

Deno.test("createHandler — POST with empty notes array returns 400", async () => {
  const h = makeHandler();
  const res = await h(makeReq({
    method: "POST",
    headers: { "x-playground-key": VALID_KEY, "content-type": "application/json" },
    body: JSON.stringify({ notes: [] }),
  }));
  assertEquals(res.status, 400);
});

Deno.test("createHandler — POST happy path forwards the report and SYSTEM_PROMPT", async () => {
  const generate = (notes: readonly string[]) =>
    Promise.resolve({
      report: { report: { meta: { title: "T" } }, usage: undefined },
      usage: { input_tokens: 10, output_tokens: 5 },
      provider: "kimi",
      model: "kimi-k2-0711-preview",
    });

  const h = makeHandler({ generate: generate as any });
  const res = await h(makeReq({
    method: "POST",
    headers: { "x-playground-key": VALID_KEY, "content-type": "application/json" },
    body: JSON.stringify({ notes: ["one", "two"] }),
  }));
  assertEquals(res.status, 200);
  const body = await readJson(res) as Record<string, unknown>;
  assertEquals((body.report as any).meta.title, "T");
  assertEquals(body.provider, "kimi");
  assertEquals(body.model, "kimi-k2-0711-preview");
  assertEquals(typeof body.systemPrompt, "string");
  assert(Array.isArray(body.serverProviders));
});

Deno.test("createHandler — POST maps LLMParseError to 502 with code", async () => {
  class LLMParseError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "LLMParseError";
    }
  }
  const generate = () => Promise.reject(new LLMParseError("bad json from model"));
  const h = makeHandler({ generate: generate as any });
  const res = await h(makeReq({
    method: "POST",
    headers: { "x-playground-key": VALID_KEY, "content-type": "application/json" },
    body: JSON.stringify({ notes: ["x"] }),
  }));
  assertEquals(res.status, 502);
  const body = await readJson(res) as { error: string; code: string };
  assertEquals(body.error, "LLM returned invalid JSON");
  assertEquals(body.code, "LLM_PARSE_ERROR");
});

Deno.test("createHandler — POST maps generic errors to 500 with the message", async () => {
  const generate = () => Promise.reject(new Error("upstream 500"));
  const h = makeHandler({ generate: generate as any });
  const res = await h(makeReq({
    method: "POST",
    headers: { "x-playground-key": VALID_KEY, "content-type": "application/json" },
    body: JSON.stringify({ notes: ["x"] }),
  }));
  assertEquals(res.status, 500);
  const body = await readJson(res) as { error: string };
  assertEquals(body.error, "upstream 500");
});

Deno.test(
  "createHandler — POST forwards provider/model overrides only when valid",
  async () => {
    const seen: { provider?: string; model?: string }[] = [];
    const generate = (
      _notes: readonly string[],
      opts: { provider?: string; model?: string },
    ) => {
      seen.push({ provider: opts.provider, model: opts.model });
      return Promise.resolve({
        report: { report: {} },
        usage: undefined,
        provider: opts.provider ?? "kimi",
        model: opts.model ?? "kimi-k2-0711-preview",
      });
    };
    const h = makeHandler({ generate: generate as any });

    // Unknown provider is ignored.
    await h(makeReq({
      method: "POST",
      headers: { "x-playground-key": VALID_KEY, "content-type": "application/json" },
      body: JSON.stringify({ notes: ["a"], provider: "bogus", model: "x" }),
    }));
    // Valid provider + invalid model → provider forwarded, model dropped.
    await h(makeReq({
      method: "POST",
      headers: { "x-playground-key": VALID_KEY, "content-type": "application/json" },
      body: JSON.stringify({ notes: ["a"], provider: "OPENAI", model: "no-such" }),
    }));
    // Valid provider + valid model → both forwarded.
    await h(makeReq({
      method: "POST",
      headers: { "x-playground-key": VALID_KEY, "content-type": "application/json" },
      body: JSON.stringify({
        notes: ["a"],
        provider: "openai",
        model: "gpt-4o-mini",
      }),
    }));

    assertEquals(seen[0], { provider: undefined, model: undefined });
    assertEquals(seen[1], { provider: "openai", model: undefined });
    assertEquals(seen[2], { provider: "openai", model: "gpt-4o-mini" });
  },
);

Deno.test(
  "createHandler — POST rate-limits after MAX requests from the same IP",
  async () => {
    const generate = () =>
      Promise.resolve({
        report: { report: {} },
        usage: undefined,
        provider: "kimi",
        model: "kimi-k2-0711-preview",
      });
    const h = makeHandler({ generate: generate as any });
    const headers = {
      "x-playground-key": VALID_KEY,
      "content-type": "application/json",
      "x-forwarded-for": "9.9.9.9",
    };
    for (let i = 0; i < RATE_LIMIT_MAX; i++) {
      const res = await h(makeReq({
        method: "POST",
        headers,
        body: JSON.stringify({ notes: ["x"] }),
      }));
      assertEquals(res.status, 200, `request ${i + 1} must succeed`);
    }
    const blocked = await h(makeReq({
      method: "POST",
      headers,
      body: JSON.stringify({ notes: ["x"] }),
    }));
    assertEquals(blocked.status, 429);
  },
);

// ── buildGetModelWithOverrides ────────────────────────────────

Deno.test(
  "buildGetModelWithOverrides falls through to defaultGetModel when no key is available",
  () => {
    const fn = buildGetModelWithOverrides({}, () => undefined);
    let err: Error | null = null;
    try {
      fn("openai", "gpt-4o-mini");
    } catch (e) {
      err = e as Error;
    }
    assert(err);
    // The thrown error comes from generate-report's getModel which complains
    // about the missing key — the message includes the env var name.
    assertStringIncludes((err!).message.toLowerCase(), "openai_api_key");
  },
);

Deno.test(
  "buildGetModelWithOverrides prefers a client-supplied key over the env",
  () => {
    const fn = buildGetModelWithOverrides({ kimi: "client-key" }, () => undefined);
    const result = fn("kimi", "kimi-k2-0711-preview");
    // We can't introspect the SDK instance deeply, but the resolved modelId
    // should match what we passed.
    assertEquals(result.modelId, "kimi-k2-0711-preview");
  },
);

Deno.test(
  "buildGetModelWithOverrides snaps to the provider's default model when the requested id is unknown",
  () => {
    const fn = buildGetModelWithOverrides({ openai: "ck" }, () => undefined);
    const result = fn("openai", "not-a-real-model");
    // First entry of PROVIDER_MODELS.openai is gpt-4o-mini.
    assertEquals(result.modelId, "gpt-4o-mini");
  },
);

// ── systemPromptOverride ──────────────────────────────────────

Deno.test("createHandler — GET response includes defaultSystemPrompt", async () => {
  const h = makeHandler();
  const res = await h(makeReq({
    method: "GET",
    headers: { "x-playground-key": VALID_KEY },
  }));
  assertEquals(res.status, 200);
  const body = await readJson(res) as { defaultSystemPrompt?: unknown };
  assertEquals(typeof body.defaultSystemPrompt, "string");
  assert((body.defaultSystemPrompt as string).length > 100);
});

Deno.test(
  "createHandler — POST forwards systemPromptOverride to the generator",
  async () => {
    const seen: { systemPromptOverride?: string }[] = [];
    const generate = (
      _notes: readonly string[],
      opts: { systemPromptOverride?: string },
    ) => {
      seen.push({ systemPromptOverride: opts.systemPromptOverride });
      return Promise.resolve({
        report: { report: {} },
        usage: undefined,
        provider: "kimi",
        model: "kimi-k2-0711-preview",
      });
    };
    const h = makeHandler({ generate: generate as any });
    const customPrompt =
      "You are a custom playground prompt. ".repeat(3) + "Test marker XYZ123.";
    const res = await h(makeReq({
      method: "POST",
      headers: { "x-playground-key": VALID_KEY, "content-type": "application/json" },
      body: JSON.stringify({ notes: ["a"], systemPromptOverride: customPrompt }),
    }));
    assertEquals(res.status, 200);
    assertEquals(seen[0].systemPromptOverride, customPrompt);
    const body = await readJson(res) as Record<string, unknown>;
    assertEquals(body.systemPrompt, customPrompt);
    assertEquals(body.systemPromptIsOverride, true);
  },
);

Deno.test(
  "createHandler — POST without systemPromptOverride uses default and flags it",
  async () => {
    const generate = () =>
      Promise.resolve({
        report: { report: {} },
        usage: undefined,
        provider: "kimi",
        model: "kimi-k2-0711-preview",
      });
    const h = makeHandler({ generate: generate as any });
    const res = await h(makeReq({
      method: "POST",
      headers: { "x-playground-key": VALID_KEY, "content-type": "application/json" },
      body: JSON.stringify({ notes: ["a"] }),
    }));
    assertEquals(res.status, 200);
    const body = await readJson(res) as Record<string, unknown>;
    assertEquals(typeof body.systemPrompt, "string");
    assertEquals(body.systemPromptIsOverride, false);
  },
);

Deno.test(
  "createHandler — POST rejects systemPromptOverride that is too short",
  async () => {
    const h = makeHandler();
    const res = await h(makeReq({
      method: "POST",
      headers: { "x-playground-key": VALID_KEY, "content-type": "application/json" },
      body: JSON.stringify({ notes: ["a"], systemPromptOverride: "too short" }),
    }));
    assertEquals(res.status, 400);
    const body = await readJson(res) as { error: string };
    assertStringIncludes(body.error, "systemPromptOverride");
  },
);

Deno.test(
  "createHandler — POST rejects systemPromptOverride that exceeds max length",
  async () => {
    const h = makeHandler();
    const huge = "x".repeat(32_001);
    const res = await h(makeReq({
      method: "POST",
      headers: { "x-playground-key": VALID_KEY, "content-type": "application/json" },
      body: JSON.stringify({ notes: ["a"], systemPromptOverride: huge }),
    }));
    assertEquals(res.status, 400);
  },
);

Deno.test(
  "createHandler — POST rejects systemPromptOverride of wrong type",
  async () => {
    const h = makeHandler();
    const res = await h(makeReq({
      method: "POST",
      headers: { "x-playground-key": VALID_KEY, "content-type": "application/json" },
      body: JSON.stringify({ notes: ["a"], systemPromptOverride: 42 }),
    }));
    assertEquals(res.status, 400);
    const body = await readJson(res) as { error: string };
    assertStringIncludes(body.error, "must be a string");
  },
);
