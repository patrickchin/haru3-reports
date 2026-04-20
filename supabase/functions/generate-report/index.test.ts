import { assertEquals, assertRejects, assertThrows } from "jsr:@std/assert";

import {
  corsHeaders,
  createHandler,
  EMPTY_REPORT,
  fetchReportFromLLM,
  formatNotes,
  generateReportFromNotes,
  getModel,
  isValidNotes,
  LLMParseError,
  parseAndApplyReport,
  resolveUserIdFromRequest,
  SYSTEM_PROMPT,
} from "./index.ts";
import type { GenerateResult, RecordUsageParams, TokenUsage } from "./index.ts";
import { applyReportPatch } from "./apply-report-patch.ts";
import { parseGeneratedSiteReport } from "./report-schema.ts";
import type {
  GeneratedReportEquipment,
  GeneratedReportIssue,
  GeneratedReportManpower,
  GeneratedReportMaterial,
  GeneratedReportRole,
} from "./report-schema.ts";

const STRUCTURED_REPORT_FIXTURE = {
  report: {
    meta: {
      title: "Daily Site Visit Report",
      reportType: "daily",
      summary: "Concrete pour progressed and one delivery delay was noted.",
      visitDate: null,
    },
    weather: null,
    manpower: {
      totalWorkers: 12,
      workerHours: null,
      workersCostPerDay: null,
      workersCostCurrency: null,
      notes: null,
      roles: [
        { role: "Concrete crew", count: 8, notes: null },
        { role: "Supervision", count: 1, notes: null },
      ],
    },
    siteConditions: [],
    activities: [
      {
        name: "Concrete pour",
        description: null,
        location: "Zone A",
        status: "completed",
        summary: "Concrete pour completed in Zone A.",
        contractors: null,
        engineers: null,
        visitors: null,
        startDate: null,
        endDate: null,
        sourceNoteIndexes: [1],
        manpower: null,
        materials: [],
        equipment: [],
        issues: [],
        observations: [],
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
        content: "- Concrete pour completed in Zone A.",
        sourceNoteIndexes: [1],
      },
      {
        title: "Issues",
        content: "- Delivery delay affected sequencing.",
        sourceNoteIndexes: [2],
      },
    ],
  },
};

Deno.test("formatNotes numbers and joins notes", () => {
  const formatted = formatNotes([
    "Sunny and 18C",
    "4 electricians on level 2",
  ]);

  assertEquals(
    formatted,
    "[1] Sunny and 18C\n[2] 4 electricians on level 2",
  );
});

Deno.test("formatNotes respects startIndex", () => {
  const formatted = formatNotes(["New note one", "New note two"], 3);
  assertEquals(formatted, "[4] New note one\n[5] New note two");
});

Deno.test("SYSTEM_PROMPT has patch and schema guidance", () => {
  const requiredSnippets = [
    "CURRENT REPORT",
    "ALL NOTES",
    '"patch"',
    "NEVER remove items",
    '"meta": {',
    '"activities": [',
    '"issues": [',
    '"sections": [',
    '"sourceNoteIndexes": [1, 2]',
    "Build activities as the main structured backbone of the report",
  ];

  for (const snippet of requiredSnippets) {
    assertEquals(
      SYSTEM_PROMPT.includes(snippet),
      true,
      `Missing snippet: ${snippet}`,
    );
  }
});

Deno.test("generateReportFromNotes sends system prompt and formatted notes", async () => {
  let callArgs: Record<string, unknown> | undefined;

  const patchResponse = {
    patch: {
      meta: {
        title: "Daily Site Visit Report",
        reportType: "daily",
        summary: "Concrete pour progressed and one delivery delay was noted.",
      },
      activities: [
        {
          name: "Concrete pour",
          location: "Zone A",
          status: "completed",
          summary: "Concrete pour completed in Zone A.",
          sourceNoteIndexes: [1],
          materials: [],
          equipment: [],
          issues: [],
          observations: [],
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
    },
  };

  const result = await generateReportFromNotes(
    ["Concrete pour in zone A", "Minor delay due to delivery"],
    {
      provider: "openai",
      getModelFn: (provider) => ({ provider }),
      generateTextFn: async (args: unknown) => {
        callArgs = args as unknown as Record<string, unknown>;
        return {
          text: JSON.stringify(patchResponse),
        };
      },
    },
  );

  assertEquals(callArgs?.system, SYSTEM_PROMPT);
  assertEquals(typeof callArgs?.prompt, "string");
  assertEquals((callArgs?.prompt as string).includes("CURRENT REPORT"), true);
  assertEquals((callArgs?.prompt as string).includes("ALL NOTES"), true);
  assertEquals(callArgs?.temperature, 0.3);
  assertEquals(result.report.report.meta.title, "Daily Site Visit Report");
  assertEquals(result.report.report.activities[0].name, "Concrete pour");
  assertEquals(result.usage, null);
  assertEquals(result.provider, "openai");
});

Deno.test("generateReportFromNotes throws when model output is not JSON", async () => {
  await assertRejects(
    () =>
      generateReportFromNotes(["note 1"], {
        provider: "openai",
        getModelFn: () => ({}),
        generateTextFn: async () => ({ text: "not-json" }),
      }),
    LLMParseError,
  );
});

Deno.test("generateReportFromNotes applies patch to empty report when no existingReport", async () => {
  const patchResponse = {
    patch: {
      meta: { title: "New Report", reportType: "daily", summary: "A summary" },
      activities: [
        {
          name: "Dig",
          status: "done",
          summary: "Dug a hole",
          sourceNoteIndexes: [1],
          materials: [],
          equipment: [],
          issues: [],
          observations: [],
        },
      ],
    },
  };

  const result = await generateReportFromNotes(["note 1"], {
    provider: "openai",
    getModelFn: () => ({}),
    generateTextFn: async () => ({ text: JSON.stringify(patchResponse) }),
  });

  assertEquals(result.report.report.meta.title, "New Report");
  assertEquals(result.report.report.activities.length, 1);
  assertEquals(result.report.report.weather, null);
});

Deno.test("handler returns 400 for invalid notes payload", async () => {
  const handler = createHandler();
  const request = new Request("http://localhost/generate-report", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ notes: [] }),
  });

  const response = await handler(request);
  const payload = await response.json();

  assertEquals(response.status, 400);
  assertEquals(payload, {
    error: "notes must be a non-empty array of strings",
  });
});

Deno.test("handler uses injected dependencies for successful generation", async () => {
  const handler = createHandler({
    provider: "openai",
    getModelFn: (provider) => ({ provider }),
    generateTextFn: async (args: unknown) => {
      const model = (args as { model: { provider: string } }).model;
      if (model.provider !== "openai") {
        throw new Error("unexpected provider");
      }

      return {
        text: JSON.stringify({
          patch: {
            meta: {
              title: "Daily Site Visit Report",
              reportType: "daily",
              summary: "No safety incidents.",
            },
          },
        }),
      };
    },
  });

  const request = new Request("http://localhost/generate-report", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ notes: ["No safety incidents today"] }),
  });

  const response = await handler(request);
  const payload = await response.json();

  assertEquals(response.status, 200);
  assertEquals(payload.report.meta.title, "Daily Site Visit Report");
  assertEquals(payload.usage, null);
});

Deno.test("generateReportFromNotes returns provider and model metadata", async () => {
  const result = await generateReportFromNotes(["note 1"], {
    provider: "anthropic",
    getModelFn: () => ({ instance: {}, modelId: "claude-test" }),
    generateTextFn: async () => ({
      text: JSON.stringify({
        patch: { meta: { title: "T", reportType: "daily", summary: "S" } },
      }),
    }),
  });

  assertEquals(result.provider, "anthropic");
  assertEquals(result.model, "claude-test");
  assertEquals(result.usage, null);
});

Deno.test("resolveUserIdFromRequest returns sub from verified JWT payload", async () => {
  const originalUrl = Deno.env.get("SUPABASE_URL");
  Deno.env.set("SUPABASE_URL", "https://example.supabase.co");

  try {
    const request = new Request("http://localhost/generate-report", {
      headers: {
        authorization: "Bearer test-token",
      },
    });

    const userId = await resolveUserIdFromRequest(request, {
      verifySupabaseJwtFn: async (token, supabaseUrl) => {
        assertEquals(token, "test-token");
        assertEquals(supabaseUrl, "https://example.supabase.co");
        return { sub: "user-123" };
      },
    });

    assertEquals(userId, "user-123");
  } finally {
    if (originalUrl === undefined) {
      Deno.env.delete("SUPABASE_URL");
    } else {
      Deno.env.set("SUPABASE_URL", originalUrl);
    }
  }
});

Deno.test("resolveUserIdFromRequest returns null when JWT verification fails", async () => {
  const originalUrl = Deno.env.get("SUPABASE_URL");
  Deno.env.set("SUPABASE_URL", "https://example.supabase.co");

  try {
    const request = new Request("http://localhost/generate-report", {
      headers: {
        authorization: "Bearer bad-token",
      },
    });

    const userId = await resolveUserIdFromRequest(request, {
      verifySupabaseJwtFn: async () => {
        throw new Error("bad signature");
      },
    });

    assertEquals(userId, null);
  } finally {
    if (originalUrl === undefined) {
      Deno.env.delete("SUPABASE_URL");
    } else {
      Deno.env.set("SUPABASE_URL", originalUrl);
    }
  }
});

Deno.test("fetchReportFromLLM records token usage when tracking context is provided", async () => {
  const recorded: RecordUsageParams[] = [];

  const result = await fetchReportFromLLM(["note 1"], {
    provider: "openai",
    getModelFn: () => ({ instance: {}, modelId: "test-model" }),
    generateTextFn: async () => ({
      text: VALID_PATCH_RESPONSE,
      usage: MOCK_USAGE,
    }),
    usageContext: {
      userId: "user-123",
      projectId: "proj-456",
    },
    recordUsageFn: async (params) => {
      recorded.push(params);
    },
  });

  assertEquals(result.usage, MOCK_USAGE);
  assertEquals(recorded.length, 1);
  assertEquals(recorded[0], {
    userId: "user-123",
    projectId: "proj-456",
    usage: MOCK_USAGE,
    model: "test-model",
    provider: "openai",
  });
});

Deno.test("generateReportFromNotes records token usage before parse failure when tracking context is provided", async () => {
  const recorded: RecordUsageParams[] = [];

  await assertRejects(
    () =>
      generateReportFromNotes(["note 1"], {
        provider: "openai",
        getModelFn: () => ({ instance: {}, modelId: "test-model" }),
        generateTextFn: async () => ({
          text: "not json at all",
          usage: MOCK_USAGE,
        }),
        usageContext: {
          userId: "user-123",
          projectId: null,
        },
        recordUsageFn: async (params) => {
          recorded.push(params);
        },
      }),
    LLMParseError,
  );

  assertEquals(recorded.length, 1);
  assertEquals(recorded[0], {
    userId: "user-123",
    projectId: null,
    usage: MOCK_USAGE,
    model: "test-model",
    provider: "openai",
  });
});

Deno.test("generateReportFromNotes uses incremental prompt when existingReport provided", async () => {
  let callArgs: Record<string, unknown> | undefined;

  const patchResponse = {
    patch: {
      meta: { summary: "Updated summary with new concrete info" },
      activities: [
        {
          name: "Concrete pour",
          status: "in_progress",
          summary: "Pour now in progress in Zone A.",
        },
      ],
    },
  };

  const result = await generateReportFromNotes(
    ["Concrete pour in zone A", "Pour has started, going well"],
    {
      provider: "openai",
      getModelFn: (provider) => ({ provider }),
      generateTextFn: async (args: unknown) => {
        callArgs = args as unknown as Record<string, unknown>;
        return { text: JSON.stringify(patchResponse) };
      },
    },
    STRUCTURED_REPORT_FIXTURE,
  );

  assertEquals(callArgs?.system, SYSTEM_PROMPT);
  assertEquals(typeof callArgs?.prompt, "string");
  assertEquals((callArgs?.prompt as string).includes("CURRENT REPORT"), true);
  assertEquals((callArgs?.prompt as string).includes("ALL NOTES"), true);

  assertEquals(
    result.report.report.meta.summary,
    "Updated summary with new concrete info",
  );
  assertEquals(result.report.report.activities[0].status, "in_progress");
  assertEquals(
    result.report.report.activities[0].summary,
    "Pour now in progress in Zone A.",
  );
  // Original issue should still be there
  assertEquals(result.report.report.issues.length, 1);
  assertEquals(result.report.report.issues[0].title, "Delivery delay");
});

Deno.test("generateReportFromNotes uses delta notes when lastProcessedNoteCount provided", async () => {
  let capturedPrompt: string | undefined;

  const result = await generateReportFromNotes(
    ["Old note 1", "Old note 2", "New note 3"],
    {
      provider: "openai",
      getModelFn: () => ({}),
      generateTextFn: async (args: unknown) => {
        capturedPrompt = (args as { prompt: string }).prompt;
        return {
          text: JSON.stringify({
            patch: { meta: { summary: "Updated with new note" } },
          }),
        };
      },
    },
    STRUCTURED_REPORT_FIXTURE,
    2,
  );

  assertEquals(capturedPrompt!.includes("ALL NOTES"), false);
  assertEquals(capturedPrompt!.includes("NEW NOTES"), true);
  assertEquals(capturedPrompt!.includes("[1] Old note 1"), false);
  assertEquals(capturedPrompt!.includes("[2] Old note 2"), false);
  assertEquals(capturedPrompt!.includes("[3] New note 3"), true);
  assertEquals(result.report.report.meta.summary, "Updated with new note");
});

Deno.test("generateReportFromNotes sends all notes when lastProcessedNoteCount is 0", async () => {
  let capturedPrompt: string | undefined;

  await generateReportFromNotes(
    ["Note 1", "Note 2"],
    {
      provider: "openai",
      getModelFn: () => ({}),
      generateTextFn: async (args: unknown) => {
        capturedPrompt = (args as { prompt: string }).prompt;
        return {
          text: JSON.stringify({ patch: { meta: { summary: "Full" } } }),
        };
      },
    },
    STRUCTURED_REPORT_FIXTURE,
    0,
  );

  assertEquals(capturedPrompt!.includes("ALL NOTES"), true);
  assertEquals(capturedPrompt!.includes("NEW NOTES"), false);
});

Deno.test("handler passes lastProcessedNoteCount to generateReportFromNotes", async () => {
  let capturedPrompt: string | undefined;

  const handler = createHandler({
    provider: "openai",
    getModelFn: () => ({}),
    generateTextFn: async (args: unknown) => {
      capturedPrompt = (args as { prompt: string }).prompt;
      return {
        text: JSON.stringify({
          patch: { meta: { summary: "Delta update" } },
        }),
      };
    },
  });

  const request = new Request("http://localhost/generate-report", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      notes: ["Note 1", "Note 2", "Note 3"],
      existingReport: STRUCTURED_REPORT_FIXTURE,
      lastProcessedNoteCount: 2,
    }),
  });

  const response = await handler(request);
  assertEquals(response.status, 200);
  assertEquals(capturedPrompt!.includes("NEW NOTES"), true);
  assertEquals(capturedPrompt!.includes("ALL NOTES"), false);
});

Deno.test("handler ignores invalid lastProcessedNoteCount and sends all notes", async () => {
  let capturedPrompt: string | undefined;

  const handler = createHandler({
    provider: "openai",
    getModelFn: () => ({}),
    generateTextFn: async (args: unknown) => {
      capturedPrompt = (args as { prompt: string }).prompt;
      return {
        text: JSON.stringify({
          patch: { meta: { summary: "Full regen" } },
        }),
      };
    },
  });

  const request = new Request("http://localhost/generate-report", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      notes: ["Note 1", "Note 2"],
      existingReport: STRUCTURED_REPORT_FIXTURE,
      lastProcessedNoteCount: "invalid",
    }),
  });

  const response = await handler(request);
  assertEquals(response.status, 200);
  assertEquals(capturedPrompt!.includes("ALL NOTES"), true);
});

Deno.test("handler passes existingReport to generateReportFromNotes", async () => {
  let receivedSystem: string | undefined;

  const handler = createHandler({
    provider: "openai",
    getModelFn: () => ({}),
    generateTextFn: async (args: unknown) => {
      receivedSystem = (args as { system: string }).system;
      return {
        text: JSON.stringify({
          patch: {
            meta: { summary: "Incremental update" },
          },
        }),
      };
    },
  });

  const request = new Request("http://localhost/generate-report", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      notes: ["New note about weather"],
      existingReport: STRUCTURED_REPORT_FIXTURE,
    }),
  });

  const response = await handler(request);
  const payload = await response.json();

  assertEquals(response.status, 200);
  assertEquals(receivedSystem, SYSTEM_PROMPT);
  assertEquals(payload.report.meta.summary, "Incremental update");
  // Rest of the report should be preserved
  assertEquals(payload.report.meta.title, "Daily Site Visit Report");
  assertEquals(payload.report.activities.length, 1);
});

// --- applyReportPatch tests ---

const BASE_REPORT: typeof STRUCTURED_REPORT_FIXTURE = {
  report: {
    meta: {
      title: "Test Report",
      reportType: "daily",
      summary: "Original summary.",
      visitDate: null,
    },
    weather: null,
    manpower: null,
    siteConditions: [],
    activities: [
      {
        name: "Foundation Work",
        description: null,
        location: "Zone A",
        status: "in_progress",
        summary: "Foundation work underway.",
        contractors: null,
        engineers: null,
        visitors: null,
        startDate: null,
        endDate: null,
        sourceNoteIndexes: [1],
        manpower: null,
        materials: [],
        equipment: [],
        issues: [],
        observations: ["Soil is dry"],
      },
    ],
    issues: [],
    nextSteps: ["Order rebar"],
    sections: [],
  },
};

Deno.test("applyReportPatch updates meta fields", () => {
  const result = applyReportPatch(BASE_REPORT, {
    meta: { summary: "Updated summary", visitDate: "2026-03-29" },
  });

  assertEquals(result.report.meta.summary, "Updated summary");
  assertEquals(result.report.meta.visitDate, "2026-03-29");
  assertEquals(result.report.meta.title, "Test Report");
});

Deno.test("applyReportPatch merges existing activity by name", () => {
  const result = applyReportPatch(BASE_REPORT, {
    activities: [
      {
        name: "Foundation Work",
        status: "completed",
        summary: "Foundation done.",
        sourceNoteIndexes: [2],
      },
    ],
  });

  assertEquals(result.report.activities.length, 1);
  assertEquals(result.report.activities[0].status, "completed");
  assertEquals(result.report.activities[0].summary, "Foundation done.");
  assertEquals(result.report.activities[0].location, "Zone A");
  assertEquals(result.report.activities[0].sourceNoteIndexes, [1, 2]);
});

Deno.test("applyReportPatch adds new activity", () => {
  const result = applyReportPatch(BASE_REPORT, {
    activities: [
      {
        name: "Concrete Pour",
        status: "in_progress",
        summary: "Pouring in zone B.",
        sourceNoteIndexes: [3],
      },
    ],
  });

  assertEquals(result.report.activities.length, 2);
  assertEquals(result.report.activities[1].name, "Concrete Pour");
});

Deno.test("applyReportPatch deduplicates nextSteps", () => {
  const result = applyReportPatch(BASE_REPORT, {
    nextSteps: ["Order rebar", "Book crane for Thursday"],
  });

  assertEquals(result.report.nextSteps.length, 2);
  assertEquals(result.report.nextSteps[0], "Order rebar");
  assertEquals(result.report.nextSteps[1], "Book crane for Thursday");
});

Deno.test("applyReportPatch deduplicates observations on activities", () => {
  const result = applyReportPatch(BASE_REPORT, {
    activities: [
      {
        name: "Foundation Work",
        observations: ["Soil is dry", "Good weather"],
      },
    ],
  });

  assertEquals(result.report.activities[0].observations.length, 2);
  assertEquals(result.report.activities[0].observations[0], "Soil is dry");
  assertEquals(result.report.activities[0].observations[1], "Good weather");
});

Deno.test("applyReportPatch adds weather when base is null", () => {
  const result = applyReportPatch(BASE_REPORT, {
    weather: { conditions: "Sunny", temperature: "22C" },
  });

  assertEquals(result.report.weather?.conditions, "Sunny");
  assertEquals(result.report.weather?.temperature, "22C");
  assertEquals(result.report.weather?.wind, null);
});

Deno.test("applyReportPatch preserves unpatched fields", () => {
  const result = applyReportPatch(BASE_REPORT, {
    meta: { summary: "New summary" },
  });

  assertEquals(result.report.activities.length, 1);
  assertEquals(result.report.activities[0].name, "Foundation Work");
  assertEquals(result.report.nextSteps, ["Order rebar"]);
  assertEquals(result.report.issues.length, 0);
});

// =========================================================================
// isValidNotes tests
// =========================================================================

Deno.test("isValidNotes returns false for non-array", () => {
  assertEquals(isValidNotes("hello"), false);
  assertEquals(isValidNotes(null), false);
  assertEquals(isValidNotes(undefined), false);
  assertEquals(isValidNotes(42), false);
});

Deno.test("isValidNotes returns false for empty array", () => {
  assertEquals(isValidNotes([]), false);
});

Deno.test("isValidNotes returns false for array with non-strings", () => {
  assertEquals(isValidNotes([1, 2, 3]), false);
  assertEquals(isValidNotes(["ok", 123]), false);
});

Deno.test("isValidNotes returns true for valid string array", () => {
  assertEquals(isValidNotes(["note one"]), true);
  assertEquals(isValidNotes(["a", "b", "c"]), true);
});

// =========================================================================
// getModel tests
// =========================================================================

Deno.test("getModel throws when OPENAI_API_KEY not set", () => {
  const original = Deno.env.get("OPENAI_API_KEY");
  Deno.env.delete("OPENAI_API_KEY");
  try {
    assertThrows(() => getModel("openai"), Error, "OPENAI_API_KEY not set");
  } finally {
    if (original) Deno.env.set("OPENAI_API_KEY", original);
  }
});

Deno.test("getModel throws when ANTHROPIC_API_KEY not set", () => {
  const original = Deno.env.get("ANTHROPIC_API_KEY");
  Deno.env.delete("ANTHROPIC_API_KEY");
  try {
    assertThrows(
      () => getModel("anthropic"),
      Error,
      "ANTHROPIC_API_KEY not set",
    );
  } finally {
    if (original) Deno.env.set("ANTHROPIC_API_KEY", original);
  }
});

Deno.test("getModel throws when GOOGLE_AI_API_KEY not set", () => {
  const original = Deno.env.get("GOOGLE_AI_API_KEY");
  Deno.env.delete("GOOGLE_AI_API_KEY");
  try {
    assertThrows(() => getModel("google"), Error, "GOOGLE_AI_API_KEY not set");
  } finally {
    if (original) Deno.env.set("GOOGLE_AI_API_KEY", original);
  }
});

Deno.test("getModel throws when MOONSHOT_API_KEY not set for kimi", () => {
  const original = Deno.env.get("MOONSHOT_API_KEY");
  Deno.env.delete("MOONSHOT_API_KEY");
  try {
    assertThrows(() => getModel("kimi"), Error, "MOONSHOT_API_KEY not set");
  } finally {
    if (original) Deno.env.set("MOONSHOT_API_KEY", original);
  }
});

Deno.test("getModel defaults to kimi for unknown provider", () => {
  const original = Deno.env.get("MOONSHOT_API_KEY");
  Deno.env.delete("MOONSHOT_API_KEY");
  try {
    assertThrows(
      () => getModel("unknown-provider"),
      Error,
      "MOONSHOT_API_KEY not set",
    );
  } finally {
    if (original) Deno.env.set("MOONSHOT_API_KEY", original);
  }
});

// =========================================================================
// handler edge cases
// =========================================================================

Deno.test("handler returns CORS headers on OPTIONS", async () => {
  const handler = createHandler();
  const request = new Request("http://localhost/generate-report", {
    method: "OPTIONS",
  });

  const response = await handler(request);
  assertEquals(response.status, 200);
  assertEquals(response.headers.get("Access-Control-Allow-Origin"), "*");
});

Deno.test("handler returns 400 for notes with non-string items", async () => {
  const handler = createHandler();
  const request = new Request("http://localhost/generate-report", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ notes: [123, 456] }),
  });

  const response = await handler(request);
  assertEquals(response.status, 400);
});

Deno.test("handler returns 500 when generateTextFn throws", async () => {
  const handler = createHandler({
    provider: "openai",
    getModelFn: () => ({}),
    generateTextFn: async () => {
      throw new Error("LLM connection failed");
    },
  });

  const request = new Request("http://localhost/generate-report", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ notes: ["Some field note"] }),
  });

  const response = await handler(request);
  const payload = await response.json();

  assertEquals(response.status, 500);
  assertEquals(payload.error, "LLM connection failed");
});

Deno.test("handler returns 500 for non-Error throws", async () => {
  const handler = createHandler({
    provider: "openai",
    getModelFn: () => ({}),
    generateTextFn: async () => {
      throw "string-error";
    },
  });

  const request = new Request("http://localhost/generate-report", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ notes: ["test note"] }),
  });

  const response = await handler(request);
  const payload = await response.json();

  assertEquals(response.status, 500);
  assertEquals(payload.error, "Unknown error");
});

Deno.test("handler ignores invalid existingReport and uses empty base", async () => {
  let receivedSystem: string | undefined;

  const handler = createHandler({
    provider: "openai",
    getModelFn: () => ({}),
    generateTextFn: async (args: unknown) => {
      receivedSystem = (args as { system: string }).system;
      return {
        text: JSON.stringify({
          patch: {
            meta: {
              title: "Fresh Report",
              reportType: "daily",
              summary: "A note",
            },
          },
        }),
      };
    },
  });

  const request = new Request("http://localhost/generate-report", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      notes: ["A note"],
      existingReport: "not-a-valid-report",
    }),
  });

  const response = await handler(request);
  const payload = await response.json();
  assertEquals(response.status, 200);
  assertEquals(receivedSystem, SYSTEM_PROMPT);
  assertEquals(payload.report.meta.title, "Fresh Report");
});

// =========================================================================
// generateReportFromNotes — incremental without "patch" wrapper
// =========================================================================

Deno.test("generateReportFromNotes handles incremental response without patch key", async () => {
  const rawPatch = {
    meta: { summary: "Direct patch without wrapper" },
  };

  const result = await generateReportFromNotes(
    ["note 1"],
    {
      provider: "openai",
      getModelFn: () => ({}),
      generateTextFn: async () => ({ text: JSON.stringify(rawPatch) }),
    },
    STRUCTURED_REPORT_FIXTURE,
  );

  assertEquals(
    result.report.report.meta.summary,
    "Direct patch without wrapper",
  );
  assertEquals(result.report.report.meta.title, "Daily Site Visit Report");
});

// =========================================================================
// parseGeneratedSiteReport tests
// =========================================================================

Deno.test("parseGeneratedSiteReport parses a full report with all fields", () => {
  const raw = {
    report: {
      meta: {
        title: "Site Visit",
        reportType: "site_visit",
        summary: "Everything went well.",
        visitDate: "2026-03-30",
      },
      weather: {
        conditions: "Sunny",
        temperature: "25C",
        wind: "10kph NW",
        impact: "None",
      },
      manpower: {
        totalWorkers: 15,
        workerHours: "8",
        workersCostPerDay: "5000",
        workersCostCurrency: "AUD",
        notes: "Full crew",
        roles: [
          { role: "Laborer", count: 10, notes: "General" },
          { role: "Supervisor", count: 2, notes: null },
        ],
      },
      siteConditions: [
        { topic: "Ground", details: "Dry and firm" },
        { topic: "Access", details: "North gate open" },
      ],
      activities: [
        {
          name: "Excavation",
          description: "Digging zone B",
          location: "Zone B",
          status: "in_progress",
          summary: "Excavation underway.",
          contractors: "ABC Corp",
          engineers: "Jane",
          visitors: "Client rep",
          startDate: "2026-03-30",
          endDate: null,
          sourceNoteIndexes: [1, 2],
          manpower: {
            totalWorkers: 5,
            workerHours: null,
            workersCostPerDay: null,
            workersCostCurrency: null,
            notes: null,
            roles: [],
          },
          materials: [
            {
              name: "Concrete",
              quantity: "20",
              quantityUnit: "m3",
              unitCost: "150",
              unitCostCurrency: "AUD",
              totalCost: "3000",
              totalCostCurrency: "AUD",
              condition: "Good",
              status: "delivered",
              notes: "32MPA mix",
            },
          ],
          equipment: [
            {
              name: "Excavator CAT 320",
              quantity: "1",
              cost: "500",
              costCurrency: "AUD",
              condition: "Good",
              ownership: "Hired",
              status: "operational",
              hoursUsed: "6",
              notes: null,
            },
          ],
          issues: [
            {
              title: "Pipe clash",
              category: "services",
              severity: "high",
              status: "open",
              details: "Hit a pipe at grid F6",
              actionRequired: "Get locator",
              sourceNoteIndexes: [2],
            },
          ],
          observations: ["Soil is clay", "Good weather"],
        },
      ],
      issues: [
        {
          title: "Late delivery",
          category: "schedule",
          severity: "medium",
          status: "open",
          details: "Bricks arrived 2 hours late.",
          actionRequired: null,
          sourceNoteIndexes: [3],
        },
      ],
      nextSteps: ["Order more rebar", "Book crane"],
      sections: [
        {
          title: "Summary",
          content: "Good day on site.",
          sourceNoteIndexes: [1, 2, 3],
        },
      ],
    },
  };

  const result = parseGeneratedSiteReport(raw);

  assertEquals(result.report.meta.title, "Site Visit");
  assertEquals(result.report.meta.visitDate, "2026-03-30");
  assertEquals(result.report.weather?.conditions, "Sunny");
  assertEquals(result.report.weather?.wind, "10kph NW");
  assertEquals(result.report.manpower?.totalWorkers, 15);
  assertEquals(result.report.manpower?.roles.length, 2);
  assertEquals(result.report.manpower?.roles[0].role, "Laborer");
  assertEquals(result.report.siteConditions.length, 2);
  assertEquals(result.report.activities.length, 1);
  assertEquals(result.report.activities[0].materials.length, 1);
  assertEquals(result.report.activities[0].materials[0].name, "Concrete");
  assertEquals(result.report.activities[0].equipment.length, 1);
  assertEquals(
    result.report.activities[0].equipment[0].name,
    "Excavator CAT 320",
  );
  assertEquals(result.report.activities[0].issues.length, 1);
  assertEquals(result.report.activities[0].observations.length, 2);
  assertEquals(result.report.activities[0].manpower?.totalWorkers, 5);
  assertEquals(result.report.issues.length, 1);
  assertEquals(result.report.nextSteps.length, 2);
  assertEquals(result.report.sections.length, 1);
  assertEquals(result.report.sections[0].sourceNoteIndexes, [1, 2, 3]);
});

Deno.test("parseGeneratedSiteReport handles null/empty optional fields", () => {
  const raw = {
    report: {
      meta: {
        title: "Minimal",
        reportType: "daily",
        summary: "Nothing happened.",
        visitDate: null,
      },
      weather: null,
      manpower: null,
      siteConditions: [],
      activities: [],
      issues: [],
      nextSteps: [],
      sections: [],
    },
  };

  const result = parseGeneratedSiteReport(raw);

  assertEquals(result.report.weather, null);
  assertEquals(result.report.manpower, null);
  assertEquals(result.report.siteConditions, []);
  assertEquals(result.report.activities, []);
});

Deno.test("parseGeneratedSiteReport throws on missing report key", () => {
  assertThrows(() => parseGeneratedSiteReport({}), TypeError);
});

// =========================================================================
// Minimal note tests — "set the title to Patrick" scenario
// =========================================================================

Deno.test("generateReportFromNotes throws LLMParseError when LLM returns empty string", async () => {
  await assertRejects(
    () =>
      generateReportFromNotes(["set the title to Patrick"], {
        provider: "openai",
        getModelFn: () => ({}),
        generateTextFn: async () => ({ text: "" }),
      }),
    LLMParseError,
  );
});

Deno.test("handler returns 502 when LLM returns empty string for minimal note", async () => {
  const handler = createHandler({
    provider: "openai",
    getModelFn: () => ({}),
    generateTextFn: async () => ({ text: "" }),
  });

  const request = new Request("http://localhost/generate-report", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ notes: ["set the title to Patrick"] }),
  });

  const response = await handler(request);
  const payload = await response.json();

  assertEquals(response.status, 502);
  assertEquals(payload.code, "LLM_PARSE_ERROR");
});

Deno.test("generateReportFromNotes produces report with title from minimal note", async () => {
  const patchResponse = {
    patch: {
      meta: {
        title: "Patrick",
        reportType: "site_visit",
        summary: "Title set to Patrick.",
      },
    },
  };

  const result = await generateReportFromNotes(
    ["set the title to Patrick"],
    {
      provider: "openai",
      getModelFn: () => ({}),
      generateTextFn: async () => ({ text: JSON.stringify(patchResponse) }),
    },
  );

  assertEquals(result.report.report.meta.title, "Patrick");
  assertEquals(result.report.report.meta.reportType, "site_visit");
  assertEquals(result.report.report.activities.length, 0);
  assertEquals(result.report.report.issues.length, 0);
  assertEquals(result.report.report.weather, null);
  assertEquals(result.report.report.manpower, null);
});

Deno.test("handler returns 200 with correct title for minimal 'set title' note", async () => {
  const handler = createHandler({
    provider: "openai",
    getModelFn: () => ({}),
    generateTextFn: async () => ({
      text: JSON.stringify({
        patch: {
          meta: {
            title: "Patrick",
            reportType: "site_visit",
            summary: "Title set to Patrick.",
          },
        },
      }),
    }),
  });

  const request = new Request("http://localhost/generate-report", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ notes: ["set the title to Patrick"] }),
  });

  const response = await handler(request);
  const payload = await response.json();

  assertEquals(response.status, 200);
  assertEquals(payload.report.meta.title, "Patrick");
  assertEquals(payload.report.meta.reportType, "site_visit");
  assertEquals(payload.report.activities.length, 0);
  assertEquals(payload.report.issues.length, 0);
});

Deno.test("parseGeneratedSiteReport throws on non-object report", () => {
  assertThrows(() => parseGeneratedSiteReport({ report: "bad" }), TypeError);
});

Deno.test("parseGeneratedSiteReport throws on missing meta", () => {
  assertThrows(
    () => parseGeneratedSiteReport({ report: { activities: [] } }),
    TypeError,
  );
});

Deno.test("parseGeneratedSiteReport coerces numeric strings in sourceNoteIndexes", () => {
  const raw = {
    report: {
      meta: { title: "T", reportType: "daily", summary: "S", visitDate: null },
      weather: null,
      manpower: null,
      siteConditions: [],
      activities: [
        {
          name: "A",
          status: "done",
          summary: "S",
          sourceNoteIndexes: ["1", "2", 3],
          materials: [],
          equipment: [],
          issues: [],
          observations: [],
        },
      ],
      issues: [],
      nextSteps: [],
      sections: [],
    },
  };

  const result = parseGeneratedSiteReport(raw);
  assertEquals(result.report.activities[0].sourceNoteIndexes, [1, 2, 3]);
});

Deno.test("parseGeneratedSiteReport deduplicates sourceNoteIndexes", () => {
  const raw = {
    report: {
      meta: { title: "T", reportType: "daily", summary: "S", visitDate: null },
      weather: null,
      manpower: null,
      siteConditions: [],
      activities: [
        {
          name: "A",
          status: "done",
          summary: "S",
          sourceNoteIndexes: [2, 1, 2, 3, 1],
          materials: [],
          equipment: [],
          issues: [],
          observations: [],
        },
      ],
      issues: [],
      nextSteps: [],
      sections: [],
    },
  };

  const result = parseGeneratedSiteReport(raw);
  assertEquals(result.report.activities[0].sourceNoteIndexes, [1, 2, 3]);
});

Deno.test("parseGeneratedSiteReport uses fallback for missing optional strings", () => {
  const raw = {
    report: {
      meta: { title: "T", reportType: "daily", summary: "S", visitDate: null },
      weather: null,
      manpower: null,
      siteConditions: [],
      activities: [
        {
          name: "A",
          status: "done",
          summary: "S",
          sourceNoteIndexes: [],
          // description, location, contractors, etc. omitted
          materials: [],
          equipment: [],
          issues: [],
          observations: [],
        },
      ],
      issues: [],
      nextSteps: [],
      sections: [],
    },
  };

  const result = parseGeneratedSiteReport(raw);
  assertEquals(result.report.activities[0].description, null);
  assertEquals(result.report.activities[0].location, null);
  assertEquals(result.report.activities[0].contractors, null);
  assertEquals(result.report.activities[0].engineers, null);
  assertEquals(result.report.activities[0].visitors, null);
  assertEquals(result.report.activities[0].startDate, null);
  assertEquals(result.report.activities[0].endDate, null);
});

Deno.test("parseGeneratedSiteReport parses manpower with numeric string totalWorkers", () => {
  const raw = {
    report: {
      meta: { title: "T", reportType: "daily", summary: "S", visitDate: null },
      weather: null,
      manpower: {
        totalWorkers: "12",
        workerHours: null,
        roles: [],
      },
      siteConditions: [],
      activities: [],
      issues: [],
      nextSteps: [],
      sections: [],
    },
  };

  const result = parseGeneratedSiteReport(raw);
  assertEquals(result.report.manpower?.totalWorkers, 12);
});

// =========================================================================
// applyReportPatch — materials, equipment, issues, sections, siteConditions
// =========================================================================

const RICH_BASE_REPORT = {
  report: {
    meta: {
      title: "Rich Report",
      reportType: "daily",
      summary: "Original.",
      visitDate: "2026-03-29",
    },
    weather: {
      conditions: "Cloudy",
      temperature: "18C",
      wind: "5kph",
      impact: "None",
    },
    manpower: {
      totalWorkers: 10,
      workerHours: "8",
      workersCostPerDay: "4000",
      workersCostCurrency: "AUD",
      notes: "Full crew",
      roles: [
        { role: "Laborer", count: 6, notes: null },
        { role: "Supervisor", count: 1, notes: "Senior" },
      ],
    },
    siteConditions: [
      { topic: "Access", details: "North gate" },
    ],
    activities: [
      {
        name: "Concrete Pour",
        description: "Pouring slab",
        location: "Zone A",
        status: "in_progress",
        summary: "Pour underway.",
        contractors: "ABC",
        engineers: null,
        visitors: null,
        startDate: "2026-03-29",
        endDate: null,
        sourceNoteIndexes: [1],
        manpower: null,
        materials: [
          {
            name: "Concrete 32MPA",
            quantity: "16",
            quantityUnit: "m3",
            unitCost: null,
            unitCostCurrency: null,
            totalCost: null,
            totalCostCurrency: null,
            condition: "Good",
            status: "delivered",
            notes: null,
          },
        ],
        equipment: [
          {
            name: "Concrete Pump",
            quantity: "1",
            cost: "800",
            costCurrency: "AUD",
            condition: "Good",
            ownership: "Hired",
            status: "operational",
            hoursUsed: "3",
            notes: null,
          },
        ],
        issues: [
          {
            title: "Pump blockage",
            category: "equipment",
            severity: "low",
            status: "resolved",
            details: "Minor blockage cleared.",
            actionRequired: null,
            sourceNoteIndexes: [1],
          },
        ],
        observations: ["Good slump"],
      },
    ],
    issues: [
      {
        title: "Delivery delay",
        category: "schedule",
        severity: "medium",
        status: "open",
        details: "Bricks late.",
        actionRequired: "Chase supplier",
        sourceNoteIndexes: [2],
      },
    ],
    nextSteps: ["Cure slab 24h"],
    sections: [
      {
        title: "Progress",
        content: "Pour went well.",
        sourceNoteIndexes: [1],
      },
    ],
  },
};

Deno.test("applyReportPatch merges materials in activity by name", () => {
  const result = applyReportPatch(RICH_BASE_REPORT, {
    activities: [
      {
        name: "Concrete Pour",
        materials: [
          {
            name: "Concrete 32MPA",
            quantity: "20",
            status: "used",
          } as GeneratedReportMaterial,
          {
            name: "Rebar N12",
            quantity: "2t",
            status: "delivered",
          } as GeneratedReportMaterial,
        ],
      },
    ],
  });

  const materials = result.report.activities[0].materials;
  assertEquals(materials.length, 2);
  assertEquals(materials[0].name, "Concrete 32MPA");
  assertEquals(materials[0].quantity, "20");
  assertEquals(materials[0].status, "used");
  assertEquals(materials[0].condition, "Good"); // preserved
  assertEquals(materials[1].name, "Rebar N12");
});

Deno.test("applyReportPatch merges equipment in activity by name", () => {
  const result = applyReportPatch(RICH_BASE_REPORT, {
    activities: [
      {
        name: "Concrete Pour",
        equipment: [
          {
            name: "Concrete Pump",
            hoursUsed: "5",
            status: "returned",
          } as GeneratedReportEquipment,
          { name: "Vibrator", quantity: "2" } as GeneratedReportEquipment,
        ],
      },
    ],
  });

  const equipment = result.report.activities[0].equipment;
  assertEquals(equipment.length, 2);
  assertEquals(equipment[0].name, "Concrete Pump");
  assertEquals(equipment[0].hoursUsed, "5");
  assertEquals(equipment[0].status, "returned");
  assertEquals(equipment[0].cost, "800"); // preserved
  assertEquals(equipment[1].name, "Vibrator");
});

Deno.test("applyReportPatch merges issues in activity by title", () => {
  const result = applyReportPatch(RICH_BASE_REPORT, {
    activities: [
      {
        name: "Concrete Pour",
        issues: [
          {
            title: "Pump blockage",
            status: "closed",
            severity: "low",
          } as GeneratedReportIssue,
          {
            title: "Formwork leak",
            category: "quality",
            severity: "medium",
            status: "open",
            details: "Leaking at C3",
          } as GeneratedReportIssue,
        ],
      },
    ],
  });

  const issues = result.report.activities[0].issues;
  assertEquals(issues.length, 2);
  assertEquals(issues[0].title, "Pump blockage");
  assertEquals(issues[0].status, "closed");
  assertEquals(issues[1].title, "Formwork leak");
});

Deno.test("applyReportPatch merges top-level issues by title", () => {
  const result = applyReportPatch(RICH_BASE_REPORT, {
    issues: [
      { title: "Delivery delay", status: "resolved" } as GeneratedReportIssue,
      {
        title: "Safety incident",
        category: "safety",
        severity: "high",
        status: "open",
        details: "Near miss",
      } as GeneratedReportIssue,
    ],
  });

  assertEquals(result.report.issues.length, 2);
  assertEquals(result.report.issues[0].status, "resolved");
  assertEquals(result.report.issues[0].details, "Bricks late."); // preserved
  assertEquals(result.report.issues[1].title, "Safety incident");
});

Deno.test("applyReportPatch merges siteConditions by topic", () => {
  const result = applyReportPatch(RICH_BASE_REPORT, {
    siteConditions: [
      { topic: "Access", details: "North and south gates open" },
      { topic: "Ground", details: "Muddy after rain" },
    ],
  });

  assertEquals(result.report.siteConditions.length, 2);
  assertEquals(result.report.siteConditions[0].topic, "Access");
  assertEquals(
    result.report.siteConditions[0].details,
    "North and south gates open",
  );
  assertEquals(result.report.siteConditions[1].topic, "Ground");
});

Deno.test("applyReportPatch merges sections by title", () => {
  const result = applyReportPatch(RICH_BASE_REPORT, {
    sections: [
      {
        title: "Progress",
        content: "Updated progress.",
        sourceNoteIndexes: [3],
      },
      { title: "Safety", content: "No incidents.", sourceNoteIndexes: [4] },
    ],
  });

  assertEquals(result.report.sections.length, 2);
  assertEquals(result.report.sections[0].content, "Updated progress.");
  assertEquals(result.report.sections[0].sourceNoteIndexes, [1, 3]);
  assertEquals(result.report.sections[1].title, "Safety");
});

Deno.test("applyReportPatch updates weather on existing weather", () => {
  const result = applyReportPatch(RICH_BASE_REPORT, {
    weather: { temperature: "22C", impact: "Mild heat" },
  });

  assertEquals(result.report.weather?.conditions, "Cloudy"); // preserved
  assertEquals(result.report.weather?.temperature, "22C");
  assertEquals(result.report.weather?.impact, "Mild heat");
});

Deno.test("applyReportPatch sets weather to null", () => {
  const result = applyReportPatch(RICH_BASE_REPORT, {
    weather: null,
  });

  assertEquals(result.report.weather, null);
});

Deno.test("applyReportPatch merges manpower roles", () => {
  const result = applyReportPatch(RICH_BASE_REPORT, {
    manpower: {
      totalWorkers: 14,
      roles: [
        { role: "Laborer", count: 8 } as GeneratedReportRole,
        { role: "Electrician", count: 3 } as GeneratedReportRole,
      ],
    },
  });

  assertEquals(result.report.manpower?.totalWorkers, 14);
  assertEquals(result.report.manpower?.workerHours, "8"); // preserved
  assertEquals(result.report.manpower?.roles.length, 3);
  assertEquals(result.report.manpower?.roles[0].count, 8);
  assertEquals(result.report.manpower?.roles[2].role, "Electrician");
});

Deno.test("applyReportPatch sets manpower to null", () => {
  const result = applyReportPatch(RICH_BASE_REPORT, {
    manpower: null,
  });

  assertEquals(result.report.manpower, null);
});

Deno.test("applyReportPatch adds manpower when base is null", () => {
  const result = applyReportPatch(BASE_REPORT, {
    manpower: {
      totalWorkers: 5,
      roles: [{ role: "Carpenter", count: 3, notes: null }],
    },
  });

  assertEquals(result.report.manpower?.totalWorkers, 5);
  assertEquals(result.report.manpower?.roles.length, 1);
  assertEquals(result.report.manpower?.workerHours, null);
});

Deno.test("applyReportPatch merges activity-level manpower", () => {
  const result = applyReportPatch(RICH_BASE_REPORT, {
    activities: [
      {
        name: "Concrete Pour",
        manpower: {
          totalWorkers: 8,
          roles: [{ role: "Concreter", count: 6 } as GeneratedReportRole],
        } as GeneratedReportManpower,
      },
    ],
  });

  assertEquals(result.report.activities[0].manpower?.totalWorkers, 8);
  assertEquals(
    result.report.activities[0].manpower?.roles[0].role,
    "Concreter",
  );
});

Deno.test("applyReportPatch skips patch items without name/title/topic", () => {
  const result = applyReportPatch(RICH_BASE_REPORT, {
    activities: [{ status: "done" } as never],
    issues: [{ severity: "high" } as never],
    siteConditions: [{ details: "test" } as never],
    sections: [{ content: "test" } as never],
  });

  // Everything should be unchanged since patch items lack identity keys
  assertEquals(result.report.activities.length, 1);
  assertEquals(result.report.issues.length, 1);
  assertEquals(result.report.siteConditions.length, 1);
  assertEquals(result.report.sections.length, 1);
});

// ── Token usage recording tests ────────────────────────────────

const VALID_PATCH_RESPONSE = JSON.stringify({
  patch: {
    meta: { title: "Test Report", reportType: "daily", summary: "Summary" },
  },
});

const MOCK_USAGE = { inputTokens: 100, outputTokens: 50, cachedTokens: 10 };

function makeHandlerDeps(overrides: {
  getUserIdFn?: (req: Request) => Promise<string | null>;
  recordUsageFn?: (params: RecordUsageParams) => Promise<void>;
  generateTextFn?: (
    args: unknown,
  ) => Promise<{ text: string; usage?: TokenUsage | null }>;
}) {
  return {
    provider: "openai",
    getModelFn: () => ({ instance: {}, modelId: "test-model" }),
    generateTextFn: overrides.generateTextFn ?? (async () => ({
      text: VALID_PATCH_RESPONSE,
      usage: MOCK_USAGE,
    })),
    ...overrides,
  };
}

function makeRequest(body: Record<string, unknown> = {}) {
  return new Request("http://localhost/generate-report", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ notes: ["Test note"], ...body }),
  });
}

Deno.test("handler records token usage with correct params", async () => {
  const recorded: RecordUsageParams[] = [];

  const handler = createHandler(makeHandlerDeps({
    getUserIdFn: async () => "user-123",
    recordUsageFn: async (params) => {
      recorded.push(params);
    },
  }));

  const response = await handler(makeRequest({ projectId: "proj-456" }));
  assertEquals(response.status, 200);
  assertEquals(recorded.length, 1);
  assertEquals(recorded[0].userId, "user-123");
  assertEquals(recorded[0].projectId, "proj-456");
  assertEquals(recorded[0].usage, MOCK_USAGE);
  assertEquals(recorded[0].model, "test-model");
  assertEquals(recorded[0].provider, "openai");
});

Deno.test("handler skips recording when userId is null", async () => {
  const recorded: RecordUsageParams[] = [];

  const handler = createHandler(makeHandlerDeps({
    getUserIdFn: async () => null,
    recordUsageFn: async (params) => {
      recorded.push(params);
    },
  }));

  const response = await handler(makeRequest());
  assertEquals(response.status, 200);
  assertEquals(recorded.length, 0);
});

Deno.test("handler skips recording when usage is null", async () => {
  const recorded: RecordUsageParams[] = [];

  const handler = createHandler(makeHandlerDeps({
    getUserIdFn: async () => "user-123",
    recordUsageFn: async (params) => {
      recorded.push(params);
    },
    generateTextFn: async () => ({ text: VALID_PATCH_RESPONSE, usage: null }),
  }));

  const response = await handler(makeRequest());
  assertEquals(response.status, 200);
  assertEquals(recorded.length, 0);
});

Deno.test("handler records usage even when LLM returns unparseable JSON", async () => {
  const recorded: RecordUsageParams[] = [];

  const handler = createHandler(makeHandlerDeps({
    getUserIdFn: async () => "user-123",
    recordUsageFn: async (params) => {
      recorded.push(params);
    },
    generateTextFn: async () => ({
      text: "not json at all",
      usage: MOCK_USAGE,
    }),
  }));

  const response = await handler(makeRequest());
  assertEquals(response.status, 502);
  // Usage was recorded before the parse failure
  assertEquals(recorded.length, 1);
  assertEquals(recorded[0].usage, MOCK_USAGE);
});

Deno.test("handler projectId defaults to null when not provided", async () => {
  const recorded: RecordUsageParams[] = [];

  const handler = createHandler(makeHandlerDeps({
    getUserIdFn: async () => "user-123",
    recordUsageFn: async (params) => {
      recorded.push(params);
    },
  }));

  const response = await handler(makeRequest());
  assertEquals(response.status, 200);
  assertEquals(recorded.length, 1);
  assertEquals(recorded[0].projectId, null);
});
