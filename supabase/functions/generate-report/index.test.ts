import { assert, assertEquals, assertRejects, assertThrows } from "jsr:@std/assert";

import {
  corsHeaders,
  createHandler,
  EMPTY_REPORT,
  fetchReportFromLLM,
  formatNotes,
  generateReportFromNotes,
  getAvailableProviders,
  getModel,
  isValidNotes,
  LLMParseError,
  parseLLMReport,
  SYSTEM_PROMPT,
  VALID_PROVIDERS,
} from "./index.ts";
import type { GenerateResult, RecordUsageParams, TokenUsage } from "./index.ts";
import { parseGeneratedSiteReport } from "./report-schema.ts";

// ── Fixtures ───────────────────────────────────────────────────

// Full-report fixture as the LLM should now return it.
const FULL_REPORT_FIXTURE = {
  report: {
    meta: {
      title: "Daily Site Visit Report",
      reportType: "daily",
      summary: "Concrete pour progressed and one delivery delay was noted.",
      visitDate: null,
    },
    weather: null,
    workers: {
      totalWorkers: 12,
      workerHours: null,
      notes: null,
      roles: [
        { role: "Concrete crew", count: 8, notes: null },
        { role: "Supervision", count: 1, notes: null },
      ],
    },
    materials: [
      {
        name: "Concrete 32 MPa",
        quantity: "20",
        quantityUnit: "m³",
        condition: null,
        status: "delivered",
        notes: null,
      },
    ],
    issues: [
      {
        title: "Delivery delay",
        category: "schedule",
        severity: "medium",
        status: "open",
        details: "One delivery arrived late and affected sequencing.",
        actionRequired: "Confirm revised delivery window.",
        sourceNoteIndexes: [2],
      },
    ],
    nextSteps: ["Confirm revised delivery window."],
    sections: [
      {
        title: "Work Progress",
        content: "Concrete pour completed in Zone A.",
        sourceNoteIndexes: [1],
      },
    ],
  },
};

function emptyReport() {
  return parseGeneratedSiteReport({
    report: {
      meta: { title: "", reportType: "daily", summary: "", visitDate: null },
    },
  });
}

// ── isValidNotes ───────────────────────────────────────────────

Deno.test("isValidNotes accepts non-empty arrays of strings", () => {
  assertEquals(isValidNotes(["a", "b"]), true);
});

Deno.test("isValidNotes rejects empty arrays", () => {
  assertEquals(isValidNotes([]), false);
});

Deno.test("isValidNotes rejects non-arrays and arrays with non-strings", () => {
  assertEquals(isValidNotes("hello"), false);
  assertEquals(isValidNotes(null), false);
  assertEquals(isValidNotes(["a", 42]), false);
});

// ── formatNotes ────────────────────────────────────────────────

Deno.test("formatNotes numbers and joins notes", () => {
  const result = formatNotes(["First", "Second"]);
  assertEquals(result, "[1] First\n[2] Second");
});

Deno.test("formatNotes respects startIndex", () => {
  const result = formatNotes(["A", "B"], 5);
  assertEquals(result, "[6] A\n[7] B");
});

// ── SYSTEM_PROMPT ──────────────────────────────────────────────

Deno.test("SYSTEM_PROMPT instructs the LLM to return the full report", () => {
  assertEquals(typeof SYSTEM_PROMPT, "string");
  assert(SYSTEM_PROMPT.length > 100);
  assert(SYSTEM_PROMPT.includes("FULL report"));
  assert(!SYSTEM_PROMPT.includes('"patch"'));
});

// ── parseLLMReport ─────────────────────────────────────────────

Deno.test("parseLLMReport returns the full report from LLM JSON", () => {
  const result = parseLLMReport({
    text: JSON.stringify(FULL_REPORT_FIXTURE),
    usage: null,
    provider: "kimi",
    model: "k1",
    systemPrompt: "test-system",
    userPrompt: "test-user",
  });

  assertEquals(result.report.report.meta.title, "Daily Site Visit Report");
  assertEquals(result.report.report.workers?.totalWorkers, 12);
  assertEquals(result.report.report.materials.length, 1);
  assertEquals(result.report.report.issues.length, 1);
  assertEquals(result.report.report.sections.length, 1);
});

Deno.test("parseLLMReport extracts JSON from markdown code blocks", () => {
  const wrapped = "```json\n" + JSON.stringify(FULL_REPORT_FIXTURE) + "\n```";
  const result = parseLLMReport({
    text: wrapped,
    usage: null,
    provider: "kimi",
    model: "k1",
    systemPrompt: "test-system",
    userPrompt: "test-user",
  });
  assertEquals(result.report.report.meta.title, "Daily Site Visit Report");
});

Deno.test("parseLLMReport throws LLMParseError on non-JSON output", () => {
  assertThrows(
    () =>
      parseLLMReport({
        text: "not json",
        usage: null,
        provider: "kimi",
        model: "k1",
        systemPrompt: "test-system",
        userPrompt: "test-user",
      }),
    LLMParseError,
  );
});

Deno.test("parseLLMReport throws LLMParseError when payload is missing meta", () => {
  assertThrows(
    () =>
      parseLLMReport({
        text: JSON.stringify({ report: { sections: [] } }),
        usage: null,
        provider: "kimi",
        model: "k1",
        systemPrompt: "test-system",
        userPrompt: "test-user",
      }),
    LLMParseError,
  );
});

// ── EMPTY_REPORT (re-exported for clients) ─────────────────────

Deno.test("EMPTY_REPORT is shaped correctly", () => {
  assertEquals(EMPTY_REPORT.report.meta.title, "");
  assertEquals(EMPTY_REPORT.report.meta.reportType, "site_visit");
  assertEquals(EMPTY_REPORT.report.materials, []);
  assertEquals(EMPTY_REPORT.report.weather, null);
});

// ── generateReportFromNotes (LLM-mocked) ───────────────────────

function makeStubModel(text: string, usage: TokenUsage | null = null) {
  return {
    generateTextFn: async (_args: unknown) => ({ text, usage }),
    getModelFn: (_provider: string) => ({ instance: {}, modelId: "stub-model" }),
  };
}

Deno.test("generateReportFromNotes parses LLM full-report output", async () => {
  const stub = makeStubModel(JSON.stringify(FULL_REPORT_FIXTURE));
  const result = await generateReportFromNotes(
    ["First note"],
    { provider: "kimi", ...stub },
  );
  assertEquals(result.report.report.meta.title, "Daily Site Visit Report");
  assertEquals(result.report.report.materials.length, 1);
});

Deno.test("generateReportFromNotes throws LLMParseError on bad JSON", async () => {
  const stub = makeStubModel("definitely not json");
  await assertRejects(
    () => generateReportFromNotes(["note"], { provider: "kimi", ...stub }),
    LLMParseError,
  );
});

Deno.test("generateReportFromNotes returns provider and model metadata", async () => {
  const stub = makeStubModel(JSON.stringify(FULL_REPORT_FIXTURE));
  const result = await generateReportFromNotes(
    ["note"],
    { provider: "kimi", ...stub },
  );
  assertEquals(result.provider, "kimi");
  assertEquals(result.model, "stub-model");
});

// ── handler ────────────────────────────────────────────────────

Deno.test("handler returns 400 for invalid notes payload", async () => {
  const handler = createHandler({ provider: "kimi" });
  const response = await handler(
    new Request("http://localhost/", {
      method: "POST",
      body: JSON.stringify({ notes: "not an array" }),
      headers: { "content-type": "application/json" },
    }),
  );
  assertEquals(response.status, 400);
});

Deno.test("handler returns 200 with report on successful generation", async () => {
  const stub = makeStubModel(JSON.stringify(FULL_REPORT_FIXTURE));
  const handler = createHandler({ provider: "kimi", ...stub });
  const response = await handler(
    new Request("http://localhost/", {
      method: "POST",
      body: JSON.stringify({ notes: ["Note 1"] }),
      headers: { "content-type": "application/json" },
    }),
  );
  assertEquals(response.status, 200);
  const body = await response.json();
  assertEquals(body.report.meta.title, "Daily Site Visit Report");
});

Deno.test("handler responds to OPTIONS preflight with CORS headers", async () => {
  const handler = createHandler({ provider: "kimi" });
  const response = await handler(
    new Request("http://localhost/", { method: "OPTIONS" }),
  );
  assertEquals(response.status, 200);
  assertEquals(
    response.headers.get("access-control-allow-origin"),
    corsHeaders["Access-Control-Allow-Origin"],
  );
});

Deno.test(
  "production handler ignores systemPromptOverride from request body",
  async () => {
    let seenSystem = "";
    const stub = {
      generateTextFn: async (args: { system: string }) => {
        seenSystem = args.system;
        return { text: JSON.stringify(FULL_REPORT_FIXTURE), usage: null };
      },
      getModelFn: (_provider: string) => ({ instance: {}, modelId: "stub-model" }),
    };
    const handler = createHandler({ provider: "kimi", ...stub });
    const response = await handler(
      new Request("http://localhost/", {
        method: "POST",
        body: JSON.stringify({
          notes: ["Note 1"],
          systemPromptOverride:
            "MALICIOUS prompt that should be ignored. ".repeat(5),
        }),
        headers: { "content-type": "application/json" },
      }),
    );
    assertEquals(response.status, 200);
    assert(seenSystem.length > 100);
    assert(!seenSystem.includes("MALICIOUS"));
  },
);

Deno.test(
  "fetchReportFromLLM honours systemPromptOverride passed via deps",
  async () => {
    let seenSystem = "";
    const customPrompt = "Custom test system prompt. " + "x".repeat(50);
    const stub = {
      generateTextFn: async (args: { system: string }) => {
        seenSystem = args.system;
        return { text: JSON.stringify(FULL_REPORT_FIXTURE), usage: null };
      },
      getModelFn: (_provider: string) => ({ instance: {}, modelId: "stub-model" }),
    };
    const result = await fetchReportFromLLM(
      ["note"],
      {
        provider: "kimi",
        ...stub,
        systemPromptOverride: customPrompt,
      },
    );
    assertEquals(seenSystem, customPrompt);
    assertEquals(result.systemPrompt, customPrompt);
  },
);

// ── fetchReportFromLLM (token usage tracking) ──────────────────

Deno.test("fetchReportFromLLM records token usage when context is provided", async () => {
  const recorded: RecordUsageParams[] = [];
  const usage: TokenUsage = { inputTokens: 100, outputTokens: 50, cachedTokens: 0 };
  const stub = makeStubModel(JSON.stringify(FULL_REPORT_FIXTURE), usage);

  await fetchReportFromLLM(
    ["note"],
    {
      provider: "kimi",
      ...stub,
      usageContext: { userId: "user-123", projectId: "project-1" },
      recordUsageFn: async (params) => {
        recorded.push(params);
      },
    },
  );

  assertEquals(recorded.length, 1);
  assertEquals(recorded[0].userId, "user-123");
  assertEquals(recorded[0].usage?.inputTokens, 100);
});

// ── (sanity) GenerateResult shape ──────────────────────────────

Deno.test("GenerateResult has report, usage, provider, and model", () => {
  const stub: GenerateResult = {
    report: emptyReport(),
    usage: null,
    provider: "kimi",
    model: "stub",
    systemPrompt: "",
    userPrompt: "",
  };
  assertEquals(stub.provider, "kimi");
});

// ── Provider registration ──────────────────────────────────────

Deno.test("zai is in VALID_PROVIDERS", () => {
  assertEquals(VALID_PROVIDERS.includes("zai" as typeof VALID_PROVIDERS[number]), true);
});

Deno.test("getModel('zai') returns glm-4.6 when ZAI_API_KEY is set", () => {
  const prev = Deno.env.get("ZAI_API_KEY");
  Deno.env.set("ZAI_API_KEY", "test-key");
  try {
    const { instance, modelId } = getModel("zai");
    assertEquals(modelId, "glm-4.6");
    assertEquals(typeof instance, "object");
  } finally {
    if (prev === undefined) Deno.env.delete("ZAI_API_KEY");
    else Deno.env.set("ZAI_API_KEY", prev);
  }
});

Deno.test("getModel('zai') throws when ZAI_API_KEY is missing", () => {
  const prev = Deno.env.get("ZAI_API_KEY");
  Deno.env.delete("ZAI_API_KEY");
  try {
    assertThrows(() => getModel("zai"), Error, "ZAI_API_KEY not set");
  } finally {
    if (prev !== undefined) Deno.env.set("ZAI_API_KEY", prev);
  }
});

Deno.test("getAvailableProviders includes zai when ZAI_API_KEY is set", () => {
  const prev = Deno.env.get("ZAI_API_KEY");
  Deno.env.set("ZAI_API_KEY", "test-key");
  try {
    assertEquals(getAvailableProviders().includes("zai"), true);
  } finally {
    if (prev === undefined) Deno.env.delete("ZAI_API_KEY");
    else Deno.env.set("ZAI_API_KEY", prev);
  }
});

Deno.test("deepseek is in VALID_PROVIDERS", () => {
  assertEquals(VALID_PROVIDERS.includes("deepseek" as typeof VALID_PROVIDERS[number]), true);
});

Deno.test("getModel('deepseek') returns deepseek-chat when DEEPSEEK_API_KEY is set", () => {
  const prev = Deno.env.get("DEEPSEEK_API_KEY");
  Deno.env.set("DEEPSEEK_API_KEY", "test-key");
  try {
    const { instance, modelId } = getModel("deepseek");
    assertEquals(modelId, "deepseek-chat");
    assertEquals(typeof instance, "object");
  } finally {
    if (prev === undefined) Deno.env.delete("DEEPSEEK_API_KEY");
    else Deno.env.set("DEEPSEEK_API_KEY", prev);
  }
});

Deno.test("getModel('deepseek') throws when DEEPSEEK_API_KEY is missing", () => {
  const prev = Deno.env.get("DEEPSEEK_API_KEY");
  Deno.env.delete("DEEPSEEK_API_KEY");
  try {
    assertThrows(() => getModel("deepseek"), Error, "DEEPSEEK_API_KEY not set");
  } finally {
    if (prev !== undefined) Deno.env.set("DEEPSEEK_API_KEY", prev);
  }
});

Deno.test("getAvailableProviders includes deepseek when DEEPSEEK_API_KEY is set", () => {
  const prev = Deno.env.get("DEEPSEEK_API_KEY");
  Deno.env.set("DEEPSEEK_API_KEY", "test-key");
  try {
    assertEquals(getAvailableProviders().includes("deepseek"), true);
  } finally {
    if (prev === undefined) Deno.env.delete("DEEPSEEK_API_KEY");
    else Deno.env.set("DEEPSEEK_API_KEY", prev);
  }
});
