/**
 * Tests for the USE_FIXTURES edge-function shim.
 *
 * Verifies that wiring `fixturesGenerateTextFn` + `fixturesGetModelFn` into
 * `createHandler` produces a working response without any LLM API call,
 * which is the contract the local Maestro E2E setup relies on.
 */

import { assert, assertEquals } from "jsr:@std/assert";

import { createHandler } from "./index.ts";
import {
  fixturesGenerateTextFn,
  fixturesGetModelFn,
  parseNotesFromUserPrompt,
} from "./use-fixtures.ts";
import { loadHappyFixture } from "./fixtures-loader.ts";

// The fixture-mode handler defaults to a 5s delay so local Maestro / manual
// fixture runs exercise loading UI. Disable it for the deno test suite.
Deno.env.set("FIXTURES_DELAY_MS", "0");

Deno.test("parseNotesFromUserPrompt recovers notes from a non-incremental prompt", () => {
  const fx = `CURRENT REPORT:
{"report":{"meta":{"title":"","reportType":"site_visit","summary":""}}}

ALL NOTES:
[1] first note
[2] second note
[3] third note`;
  assertEquals(parseNotesFromUserPrompt(fx), [
    "first note",
    "second note",
    "third note",
  ]);
});

Deno.test("USE_FIXTURES handler returns a parsed report without calling the LLM", async () => {
  const fx = await loadHappyFixture("quiet-day");

  const handler = createHandler({
    generateTextFn: fixturesGenerateTextFn,
    getModelFn: fixturesGetModelFn,
    // No userId -> usage recording skipped (warns), no Supabase call.
    getUserIdFn: () => Promise.resolve(null),
  });

  const response = await handler(
    new Request("http://localhost/generate-report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        notes: fx.input.notes,
        provider: "kimi",
      }),
    }),
  );

  assertEquals(response.status, 200);
  const json = await response.json() as {
    report: { meta: { title: string }; sections: unknown[] };
  };
  assert(
    json.report?.meta?.title?.length > 0,
    "fixture-served report should have a non-empty title",
  );
  assert(Array.isArray(json.report.sections), "should have sections array");
});

Deno.test("USE_FIXTURES handler still validates input (rejects non-array notes)", async () => {
  const handler = createHandler({
    generateTextFn: fixturesGenerateTextFn,
    getModelFn: fixturesGetModelFn,
    getUserIdFn: () => Promise.resolve(null),
  });

  const response = await handler(
    new Request("http://localhost/generate-report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes: "not an array" }),
    }),
  );

  assertEquals(response.status, 400);
});
