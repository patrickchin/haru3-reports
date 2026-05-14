/**
 * Fixture-driven tests for parseLLMReport.
 *
 * Replays *.raw.txt fixtures (captured from the real LLM via
 * capture-fixtures.ts, plus hand-crafted error fixtures) through the parser
 * and asserts the documented behaviour:
 *
 *   - Happy fixtures must round-trip exactly to their *.parsed.json snapshot.
 *   - Error fixtures must throw LLMParseError or succeed cleanly per
 *     fixtures/errors/MANIFEST.json.
 *
 * These tests are pure (no LLM call, no network) and run in the standard
 * Deno unit suite via .github/workflows/generate-report.yml.
 */

import { assert, assertEquals } from "jsr:@std/assert";

import {
  LLMParseError,
  parseLLMReport,
  SYSTEM_PROMPT,
} from "./index.ts";
import {
  listHappyFixtureNames,
  loadAllErrorFixtures,
  loadHappyFixture,
  loadPromptVersion,
  sha256,
} from "./fixtures-loader.ts";

// ── Happy fixtures: round-trip via parseLLMReport ──────────────────────────

const happyNames = await listHappyFixtureNames();

if (happyNames.length === 0) {
  Deno.test({
    name: "[fixtures] happy fixtures present",
    fn() {
      throw new Error(
        "No happy fixtures found under fixtures/happy/. Run capture-fixtures.ts.",
      );
    },
  });
}

for (const name of happyNames) {
  Deno.test({
    name: `[fixture-happy] ${name} — raw.txt → parseLLMReport matches parsed.json`,
    async fn() {
      const fx = await loadHappyFixture(name);
      const result = parseLLMReport({
        text: fx.rawText,
        usage: null,
        provider: "fixture",
        model: "fixture",
        systemPrompt: SYSTEM_PROMPT,
        userPrompt: "",
      });

      // Compare only the report payload — provider/model/usage/prompts are
      // metadata that varies between captures and isn't part of the contract.
      assertEquals(
        result.report,
        fx.parsed.report,
        `parsed report for fixture "${name}" diverged from snapshot. ` +
          `If this is intentional after a parser/schema change, run:\n` +
          `  deno run --allow-env --allow-read --allow-write \\\n` +
          `    supabase/functions/generate-report/capture-fixtures.ts \\\n` +
          `    --rebuild-parsed`,
      );
    },
  });
}

// ── Error fixtures: graceful failure modes ─────────────────────────────────

const errorFixtures = await loadAllErrorFixtures();

for (const fx of errorFixtures) {
  Deno.test({
    name: `[fixture-error] ${fx.name} — ${fx.expected.kind}`,
    fn() {
      const invoke = () =>
        parseLLMReport({
          text: fx.rawText,
          usage: null,
          provider: "fixture",
          model: "fixture",
          systemPrompt: SYSTEM_PROMPT,
          userPrompt: "",
        });

      if (fx.expected.kind === "throws") {
        let threw: unknown = null;
        try {
          invoke();
        } catch (err) {
          threw = err;
        }
        assert(threw !== null, `Expected ${fx.name} to throw, but it succeeded.`);
        assert(
          threw instanceof LLMParseError,
          `Expected LLMParseError for ${fx.name}, got ${
            (threw as Error)?.constructor?.name ?? typeof threw
          }: ${(threw as Error)?.message}`,
        );
        const e = threw as LLMParseError;
        assertEquals(
          e.rawText,
          fx.rawText,
          `LLMParseError.rawText must equal the input for ${fx.name}`,
        );
        return;
      }

      // expected: succeeds — should NOT throw.
      const result = invoke();
      assert(
        result.report?.report,
        `Expected ${fx.name} to produce a valid report, got: ${
          JSON.stringify(result).slice(0, 200)
        }`,
      );
    },
  });
}

// ── Staleness warning (non-fatal) ──────────────────────────────────────────

Deno.test({
  name: "[fixture-meta] prompt-version.json hash matches live SYSTEM_PROMPT",
  async fn() {
    const recorded = await loadPromptVersion();
    assert(
      recorded,
      "fixtures/prompt-version.json missing — run capture-fixtures.ts --rebuild-parsed",
    );
    const live = await sha256(SYSTEM_PROMPT);
    if (recorded.systemPromptHash !== live) {
      console.warn(
        `⚠️  Fixture prompt hash drift detected.\n` +
          `   recorded: ${recorded.systemPromptHash.slice(0, 12)}…\n` +
          `   live:     ${live.slice(0, 12)}…\n` +
          `   Refresh fixtures with capture-fixtures.ts (or --rebuild-parsed for ` +
          `parser-only changes).`,
      );
    }
  },
});
