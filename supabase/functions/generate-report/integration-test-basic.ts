/**
 * Basic integration tests — simple note sets, structural assertions.
 *
 * These tests use small inputs and check that the LLM returns
 * well-formed reports with the correct structure. They avoid
 * keyword-specific assertions that are sensitive to LLM paraphrasing.
 *
 * Controlled by environment variables:
 *   INTEGRATION=true        — enable these tests (skipped otherwise)
 *   AI_PROVIDER=kimi        — which provider to test (default: kimi)
 *
 * Usage:
 *   INTEGRATION=true deno test --allow-env --allow-net --allow-read \
 *     supabase/functions/generate-report/integration-test-basic.ts
 */

import { assert } from "jsr:@std/assert";
import { generateReportFromNotes } from "./index.ts";
import { QUIET_DAY } from "./sample-notes.ts";
import {
  INTEGRATION,
  provider,
  skipUnlessIntegration,
  assertValidReport,
  assertValidSourceIndexes,
  assertHasWeather,
  assertReportMentions,
  logReportSummary,
  PROVIDER_ENDPOINTS,
  checkReachable,
} from "./integration-test-helpers.ts";

// ---------------------------------------------------------------------------
// API reachability tests — always run (no INTEGRATION flag needed)
// ---------------------------------------------------------------------------

for (const [name, url] of Object.entries(PROVIDER_ENDPOINTS)) {
  Deno.test({
    name: `[reachability] ${name} API endpoint is reachable (${new URL(url).hostname})`,
    async fn() {
      const result = await checkReachable(url);
      console.log(
        `  → ${name}: ${result.reachable ? `reachable (HTTP ${result.status})` : `unreachable — ${result.error}`}`,
      );
      assert(
        result.reachable,
        `${name} API at ${url} is not reachable: ${result.error}`,
      );
    },
  });
}

Deno.test({
  name: `[reachability] configured provider "${provider}" endpoint responds`,
  async fn() {
    const url = PROVIDER_ENDPOINTS[provider];
    assert(url, `No known endpoint for provider "${provider}"`);
    const result = await checkReachable(url);
    assert(
      result.reachable,
      `Configured provider "${provider}" is not reachable at ${url}: ${result.error}`,
    );
    console.log(
      `  → ${provider}: HTTP ${result.status} (this is the provider your tests will use)`,
    );
  },
});

// ===========================================================================
// Generation — simple note sets with structural assertions
// ===========================================================================

Deno.test({
  name: `[${provider}] basic — single minimal note`,
  ignore: skipUnlessIntegration(),
  async fn() {
    const result = await generateReportFromNotes(
      ["sunny day, 22 degrees, no wind. just me on site doing a quick check. everything looks fine."],
      { provider },
    );

    assertValidReport(result);
    assertValidSourceIndexes(result, 1);
    assertHasWeather(result);

    const keys = Object.keys(result.report);
    for (const expected of [
      "meta", "weather", "manpower", "siteConditions",
      "activities", "issues", "nextSteps", "sections",
    ]) {
      assert(keys.includes(expected), `missing top-level key: ${expected}`);
    }
    logReportSummary(result);
  },
});

Deno.test({
  name: `[${provider}] basic — quiet day (9 notes, minimal activity)`,
  ignore: skipUnlessIntegration(),
  async fn() {
    const result = await generateReportFromNotes(QUIET_DAY, { provider });

    assertValidReport(result);
    assertValidSourceIndexes(result, QUIET_DAY.length);
    assert(result.report.activities.length >= 1, "should produce at least 1 activity");
    assertHasWeather(result);
    logReportSummary(result);
  },
});

Deno.test({
  name: `[${provider}] basic — self-correction picks corrected value`,
  ignore: skipUnlessIntegration(),
  async fn() {
    const notes = [
      "concrete pour today in zone A, using 40 MPA mix",
      "wait no its 32 MPA for the slab, 40 was for the columns last week. yeah 32 is right",
      "pour went well, finished by lunch",
    ];
    const result = await generateReportFromNotes(notes, { provider });

    assertValidReport(result);
    assertReportMentions(result, ["32"], "should use the corrected 32 MPA value");
    logReportSummary(result);
  },
});

Deno.test({
  name: `[${provider}] basic — weather only, no real activities`,
  ignore: skipUnlessIntegration(),
  async fn() {
    const result = await generateReportFromNotes(
      [
        "arrived on site 7am, pouring rain. 14 degrees. wind gusting to 40kph from the south west",
        "rain hasnt let up. site is waterlogged. sent everyone home at 8am. no work today",
      ],
      { provider },
    );

    assertValidReport(result);
    assertHasWeather(result);
    logReportSummary(result);
  },
});
