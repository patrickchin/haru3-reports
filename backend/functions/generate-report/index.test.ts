import {
  assertEquals,
  assertRejects,
} from "jsr:@std/assert";

import {
  SYSTEM_PROMPT,
  createHandler,
  formatNotes,
  generateReportFromNotes,
} from "./index.ts";

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
        location: "Zone A",
        status: "completed",
        summary: "Concrete pour completed in Zone A.",
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
    assertEquals(SYSTEM_PROMPT.includes(snippet), true);
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
