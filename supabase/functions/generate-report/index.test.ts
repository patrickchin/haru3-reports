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

Deno.test("SYSTEM_PROMPT keeps required schema and section names", () => {
  const requiredSnippets = [
    "Return ONLY valid JSON matching this schema",
    '{ "report": [{ "section": "<section name>", "content": "<prose>" }] }',
    "- Weather:",
    "- Manpower:",
    "- Work Progress:",
    "- Site Conditions:",
    "- Observations:",
    "- Issues:",
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
          text: JSON.stringify({
            report: [{ section: "Work Progress", content: "Concrete pour completed." }],
          }),
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
  assertEquals(result, {
    report: [{ section: "Work Progress", content: "Concrete pour completed." }],
  });
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
        text: JSON.stringify({
          report: [{ section: "Issues", content: "No major issues observed." }],
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
  assertEquals(payload, {
    report: [{ section: "Issues", content: "No major issues observed." }],
  });
});
