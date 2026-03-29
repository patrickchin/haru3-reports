import {
  assertEquals,
  assertRejects,
} from "jsr:@std/assert";

import {
  SYSTEM_PROMPT,
  INCREMENTAL_SYSTEM_PROMPT,
  createHandler,
  formatNotes,
  generateReportFromNotes,
} from "./index.ts";
import { applyReportPatch } from "./apply-report-patch.ts";

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

Deno.test("SYSTEM_PROMPT keeps required structured schema guidance", () => {
  const requiredSnippets = [
    "Return ONLY valid JSON matching this shape",
    '"meta": {',
    '"activities": [',
    '"issues": [',
    '"sections": [',
    '"sourceNoteIndexes": [1, 2]',
    "Always include every top-level key exactly once",
    "Build activities as the main structured backbone of the report",
  ];

  for (const snippet of requiredSnippets) {
    assertEquals(SYSTEM_PROMPT.includes(snippet), true, `Missing snippet: ${snippet}`);
  }
});

Deno.test("INCREMENTAL_SYSTEM_PROMPT has patch guidance", () => {
  const requiredSnippets = [
    "UPDATING an existing report",
    "CURRENT REPORT",
    "ALL NOTES",
    '"patch"',
    "NEVER remove items",
  ];

  for (const snippet of requiredSnippets) {
    assertEquals(
      INCREMENTAL_SYSTEM_PROMPT.includes(snippet),
      true,
      `Missing snippet: ${snippet}`,
    );
  }
});

Deno.test("generateReportFromNotes sends system prompt and formatted notes", async () => {
  let callArgs: Record<string, unknown> | undefined;

  const result = await generateReportFromNotes(
    ["Concrete pour in zone A", "Minor delay due to delivery"],
    {
      provider: "openai",
      getModelFn: (provider) => ({ provider }),
      generateTextFn: async (args: unknown) => {
        callArgs = args as unknown as Record<string, unknown>;
        return {
          text: JSON.stringify(STRUCTURED_REPORT_FIXTURE),
        };
      },
    },
  );

  assertEquals(callArgs?.system, SYSTEM_PROMPT);
  assertEquals(
    callArgs?.prompt,
    "[1] Concrete pour in zone A\n[2] Minor delay due to delivery",
  );
  assertEquals(callArgs?.temperature, 0.3);
  assertEquals(result, STRUCTURED_REPORT_FIXTURE);
});

Deno.test("generateReportFromNotes throws when model output is not JSON", async () => {
  await assertRejects(
    () =>
      generateReportFromNotes(["note 1"], {
        provider: "openai",
        getModelFn: () => ({}),
        generateTextFn: async () => ({ text: "not-json" }),
      }),
    SyntaxError,
  );
});

Deno.test("generateReportFromNotes throws when model output does not match structured schema", async () => {
  await assertRejects(
    () =>
      generateReportFromNotes(["note 1"], {
        provider: "openai",
        getModelFn: () => ({}),
        generateTextFn: async () =>
          ({
            text: JSON.stringify({
              report: [{ section: "Issues", content: "Still flat" }],
            }),
          }),
      }),
    TypeError,
  );
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
  assertEquals(payload, { error: "notes must be a non-empty array of strings" });
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
        text: JSON.stringify(STRUCTURED_REPORT_FIXTURE),
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
  assertEquals(payload, STRUCTURED_REPORT_FIXTURE);
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

  assertEquals(callArgs?.system, INCREMENTAL_SYSTEM_PROMPT);
  assertEquals(typeof callArgs?.prompt, "string");
  assertEquals((callArgs?.prompt as string).includes("CURRENT REPORT"), true);
  assertEquals((callArgs?.prompt as string).includes("ALL NOTES"), true);

  assertEquals(result.report.meta.summary, "Updated summary with new concrete info");
  assertEquals(result.report.activities[0].status, "in_progress");
  assertEquals(result.report.activities[0].summary, "Pour now in progress in Zone A.");
  // Original issue should still be there
  assertEquals(result.report.issues.length, 1);
  assertEquals(result.report.issues[0].title, "Delivery delay");
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
  assertEquals(receivedSystem, INCREMENTAL_SYSTEM_PROMPT);
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
