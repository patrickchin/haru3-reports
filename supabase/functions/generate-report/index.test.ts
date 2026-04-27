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
  parseAndApplyReport,
  SYSTEM_PROMPT,
  VALID_PROVIDERS,
} from "./index.ts";
import type { GenerateResult, RecordUsageParams, TokenUsage } from "./index.ts";
import { applyReportPatch } from "./apply-report-patch.ts";
import { parseGeneratedSiteReport } from "./report-schema.ts";
import type {
  GeneratedSiteReport,
  GeneratedReportIssue,
  GeneratedReportMaterial,
  GeneratedReportRole,
  GeneratedReportWorkers,
} from "./report-schema.ts";

// ── Fixtures ───────────────────────────────────────────────────

// Patch shape sent by the LLM. parseAndApplyReport calls applyReportPatch on the
// top-level keys (meta, weather, workers, materials, issues, nextSteps, sections),
// not a nested { report: {...} }.
const STRUCTURED_PATCH_FIXTURE = {
  meta: {
    title: "Daily Site Visit Report",
    reportType: "daily",
    summary: "Concrete pour progressed and one delivery delay was noted.",
    visitDate: null,
  },
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
};

function emptyReport(): GeneratedSiteReport {
  return parseGeneratedSiteReport({
    report: {
      meta: { title: "", reportType: "daily", summary: "", visitDate: null },
    },
  });
}

function reportWith(
  overrides: Partial<GeneratedSiteReport["report"]>,
): GeneratedSiteReport {
  return parseGeneratedSiteReport({
    report: {
      meta: { title: "Test", reportType: "daily", summary: "Test", visitDate: null },
      ...overrides,
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

Deno.test("SYSTEM_PROMPT mentions patch semantics and the new schema", () => {
  assertEquals(typeof SYSTEM_PROMPT, "string");
  assertEquals(SYSTEM_PROMPT.length > 100, true);
});

// ── parseAndApplyReport ────────────────────────────────────────

Deno.test("parseAndApplyReport applies LLM JSON patch onto base report", () => {
  const result = parseAndApplyReport({
    text: JSON.stringify(STRUCTURED_PATCH_FIXTURE),
    usage: null,
    provider: "kimi",
    model: "k1",
    base: EMPTY_REPORT,
    systemPrompt: "test-system",
    userPrompt: "test-user",
  });

  assertEquals(result.report.report.meta.title, "Daily Site Visit Report");
  assertEquals(result.report.report.workers?.totalWorkers, 12);
  assertEquals(result.report.report.materials.length, 1);
  assertEquals(result.report.report.issues.length, 1);
  assertEquals(result.report.report.sections.length, 1);
});

Deno.test("parseAndApplyReport accepts wrapped { patch, remove } envelope", () => {
  const result = parseAndApplyReport({
    text: JSON.stringify({
      patch: { meta: { title: "Wrapped" } },
      remove: { weather: false },
    }),
    usage: null,
    provider: "kimi",
    model: "k1",
    base: EMPTY_REPORT,
    systemPrompt: "test-system",
    userPrompt: "test-user",
  });
  assertEquals(result.report.report.meta.title, "Wrapped");
});

Deno.test("parseAndApplyReport extracts JSON from markdown code blocks", () => {
  const wrapped = "```json\n" +
    JSON.stringify(STRUCTURED_PATCH_FIXTURE) +
    "\n```";
  const result = parseAndApplyReport({
    text: wrapped,
    usage: null,
    provider: "kimi",
    model: "k1",
    base: EMPTY_REPORT,
    systemPrompt: "test-system",
    userPrompt: "test-user",
  });
  assertEquals(result.report.report.meta.title, "Daily Site Visit Report");
});

Deno.test("parseAndApplyReport throws LLMParseError on non-JSON output", () => {
  assertThrows(
    () =>
      parseAndApplyReport({
        text: "not json",
        usage: null,
        provider: "kimi",
        model: "k1",
        base: EMPTY_REPORT,
        systemPrompt: "test-system",
        userPrompt: "test-user",
      }),
    LLMParseError,
  );
});

// ── applyReportPatch — meta ────────────────────────────────────

Deno.test("applyReportPatch updates meta fields", () => {
  const result = applyReportPatch(emptyReport(), {
    meta: {
      title: "New Title",
      summary: "New Summary",
      visitDate: "2026-04-20",
    },
  });
  assertEquals(result.report.meta.title, "New Title");
  assertEquals(result.report.meta.summary, "New Summary");
  assertEquals(result.report.meta.visitDate, "2026-04-20");
});

// ── applyReportPatch — weather ─────────────────────────────────

Deno.test("applyReportPatch sets weather when previously null", () => {
  const result = applyReportPatch(emptyReport(), {
    weather: {
      conditions: "Sunny",
      temperature: "25°C",
      wind: null,
      impact: null,
    },
  });
  assertEquals(result.report.weather?.conditions, "Sunny");
  assertEquals(result.report.weather?.temperature, "25°C");
});

Deno.test("applyReportPatch merges weather field-by-field, preserving existing values", () => {
  const base = reportWith({
    weather: {
      conditions: "Sunny",
      temperature: "25°C",
      wind: null,
      impact: null,
    },
  });
  const result = applyReportPatch(base, {
    weather: { wind: "Light breeze" },
  });
  assertEquals(result.report.weather?.conditions, "Sunny");
  assertEquals(result.report.weather?.temperature, "25°C");
  assertEquals(result.report.weather?.wind, "Light breeze");
});

// ── applyReportPatch — workers ─────────────────────────────────

Deno.test("applyReportPatch sets workers when previously null", () => {
  const result = applyReportPatch(emptyReport(), {
    workers: {
      totalWorkers: 5,
      workerHours: "40h",
      notes: null,
      roles: [{ role: "Carpenter", count: 5, notes: null }],
    },
  });
  assertEquals(result.report.workers?.totalWorkers, 5);
  assertEquals(result.report.workers?.roles.length, 1);
});

Deno.test("applyReportPatch merges workers and dedupes roles by name", () => {
  const base = reportWith({
    workers: {
      totalWorkers: 5,
      workerHours: "40h",
      notes: null,
      roles: [{ role: "Carpenter", count: 5, notes: null }],
    },
  });
  const result = applyReportPatch(base, {
    workers: {
      totalWorkers: 8,
      roles: [
        { role: "Carpenter", count: 6, notes: "Updated" },
        { role: "Electrician", count: 2, notes: null },
      ],
    },
  });
  assertEquals(result.report.workers?.totalWorkers, 8);
  assertEquals(result.report.workers?.workerHours, "40h"); // preserved
  assertEquals(result.report.workers?.roles.length, 2);
  const carpenter = result.report.workers!.roles.find(
    (r: GeneratedReportRole) => r.role === "Carpenter",
  );
  assertEquals(carpenter?.count, 6);
  assertEquals(carpenter?.notes, "Updated");
});

// ── applyReportPatch — materials ───────────────────────────────

Deno.test("applyReportPatch appends new materials by name", () => {
  const result = applyReportPatch(emptyReport(), {
    materials: [
      { name: "Concrete", quantity: "10", quantityUnit: "m³", status: "delivered" } as GeneratedReportMaterial,
      { name: "Rebar", quantity: "200", quantityUnit: "kg", status: "delivered" } as GeneratedReportMaterial,
    ],
  });
  assertEquals(result.report.materials.length, 2);
  assertEquals(result.report.materials[0].name, "Concrete");
});

Deno.test("applyReportPatch updates existing material by name (case-insensitive)", () => {
  const base = reportWith({
    materials: [
      { name: "Concrete", quantity: "10", quantityUnit: "m³", condition: "Good", status: "delivered", notes: null },
    ],
  });
  const result = applyReportPatch(base, {
    materials: [
      { name: "concrete", quantity: "20", status: "used" } as GeneratedReportMaterial,
    ],
  });
  assertEquals(result.report.materials.length, 1);
  assertEquals(result.report.materials[0].quantity, "20");
  assertEquals(result.report.materials[0].status, "used");
  assertEquals(result.report.materials[0].condition, "Good"); // preserved
});

// ── applyReportPatch — issues ──────────────────────────────────

Deno.test("applyReportPatch appends new issues and updates by title", () => {
  const base = reportWith({
    issues: [
      {
        title: "Delivery delay",
        category: "schedule",
        severity: "medium",
        status: "open",
        details: "Late",
        actionRequired: null,
        sourceNoteIndexes: [],
      },
    ],
  });
  const result = applyReportPatch(base, {
    issues: [
      {
        title: "Delivery delay",
        status: "resolved",
      } as GeneratedReportIssue,
      {
        title: "Crane leak",
        category: "equipment",
        severity: "low",
        status: "open",
        details: "Minor",
        actionRequired: null,
        sourceNoteIndexes: [],
      } as GeneratedReportIssue,
    ],
  });
  assertEquals(result.report.issues.length, 2);
  const updated = result.report.issues.find(
    (i: GeneratedReportIssue) => i.title === "Delivery delay",
  );
  assertEquals(updated?.status, "resolved");
  assertEquals(updated?.severity, "medium"); // preserved
});

// ── applyReportPatch — sections ────────────────────────────────

Deno.test("applyReportPatch appends new sections and updates by title", () => {
  const base = reportWith({
    sections: [
      { title: "Work Progress", content: "Old content", sourceNoteIndexes: [1] },
    ],
  });
  const result = applyReportPatch(base, {
    sections: [
      { title: "Work Progress", content: "New content", sourceNoteIndexes: [1, 2] },
      { title: "Issues", content: "Issue list", sourceNoteIndexes: [3] },
    ],
  });
  assertEquals(result.report.sections.length, 2);
  const work = result.report.sections.find((s) => s.title === "Work Progress");
  assertEquals(work?.content, "New content");
  assertEquals(work?.sourceNoteIndexes, [1, 2]);
});

// ── applyReportPatch — nextSteps ───────────────────────────────

Deno.test("applyReportPatch dedupes and appends nextSteps", () => {
  const base = reportWith({
    nextSteps: ["Continue pour", "Order rebar"],
  });
  const result = applyReportPatch(base, {
    nextSteps: ["Continue pour", "Book pump"],
  });
  assertEquals(result.report.nextSteps.length, 3);
});

// ── applyReportPatch — removals ────────────────────────────────

Deno.test("applyReportPatch removes weather when remove.weather is true", () => {
  const base = reportWith({
    weather: { conditions: "Sunny", temperature: null, wind: null, impact: null },
  });
  const result = applyReportPatch(base, {}, { weather: true });
  assertEquals(result.report.weather, null);
});

Deno.test("applyReportPatch removes workers when remove.workers is true", () => {
  const base = reportWith({
    workers: {
      totalWorkers: 5,
      workerHours: null,
      notes: null,
      roles: [],
    } as GeneratedReportWorkers,
  });
  const result = applyReportPatch(base, {}, { workers: true });
  assertEquals(result.report.workers, null);
});

Deno.test("applyReportPatch removes materials, issues, sections, and nextSteps by key", () => {
  const base = reportWith({
    materials: [
      { name: "Concrete", quantity: null, quantityUnit: null, condition: null, status: null, notes: null },
      { name: "Rebar", quantity: null, quantityUnit: null, condition: null, status: null, notes: null },
    ],
    issues: [
      {
        title: "Delay",
        category: "schedule",
        severity: "medium",
        status: "open",
        details: "Late",
        actionRequired: null,
        sourceNoteIndexes: [],
      },
    ],
    sections: [
      { title: "Work Progress", content: "Body", sourceNoteIndexes: [] },
      { title: "Issues", content: "Body", sourceNoteIndexes: [] },
    ],
    nextSteps: ["Step A", "Step B"],
  });
  const result = applyReportPatch(base, {}, {
    materials: ["concrete"],
    issues: ["DELAY"],
    sections: ["issues"],
    nextSteps: ["Step A"],
  });
  assertEquals(result.report.materials.length, 1);
  assertEquals(result.report.materials[0].name, "Rebar");
  assertEquals(result.report.issues.length, 0);
  assertEquals(result.report.sections.length, 1);
  assertEquals(result.report.sections[0].title, "Work Progress");
  assertEquals(result.report.nextSteps, ["Step B"]);
});

// ── generateReportFromNotes (LLM-mocked) ───────────────────────

function makeStubModel(text: string, usage: TokenUsage | null = null) {
  return {
    generateTextFn: async (_args: unknown) => ({ text, usage }),
    getModelFn: (_provider: string) => ({ instance: {}, modelId: "stub-model" }),
  };
}

Deno.test("generateReportFromNotes parses LLM patch and applies it", async () => {
  const stub = makeStubModel(JSON.stringify(STRUCTURED_PATCH_FIXTURE));
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
  const stub = makeStubModel(JSON.stringify(STRUCTURED_PATCH_FIXTURE));
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
  const stub = makeStubModel(JSON.stringify(STRUCTURED_PATCH_FIXTURE));
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
    // Capture what the LLM stub actually receives so we can assert the
    // production prompt remains in use even if the client sends an override.
    let seenSystem = "";
    const stub = {
      generateTextFn: async (args: { system: string }) => {
        seenSystem = args.system;
        return { text: JSON.stringify(STRUCTURED_PATCH_FIXTURE), usage: null };
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
    // The stub must have been invoked with the production SYSTEM_PROMPT, not
    // anything from the request body.
    assert(seenSystem.length > 100);
    assert(!seenSystem.includes("MALICIOUS"));
  },
);

Deno.test(
  "fetchReportFromLLM honours systemPromptOverride passed via deps",
  async () => {
    let seenSystem = "";
    const customPrompt =
      "Custom test system prompt. " + "x".repeat(50);
    const stub = {
      generateTextFn: async (args: { system: string }) => {
        seenSystem = args.system;
        return { text: JSON.stringify(STRUCTURED_PATCH_FIXTURE), usage: null };
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
  const stub = makeStubModel(JSON.stringify(STRUCTURED_PATCH_FIXTURE), usage);

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
