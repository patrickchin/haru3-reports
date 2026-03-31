/**
 * Integration tests that call the REAL LLM API.
 *
 * Controlled by environment variables:
 *   INTEGRATION=true        — enable these tests (skipped otherwise)
 *   AI_PROVIDER=kimi        — which provider to test (default: kimi)
 *
 * You also need the matching API key set:
 *   MOONSHOT_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY, or GOOGLE_AI_API_KEY
 *
 * Usage:
 *   # Source your env file, then run:
 *   INTEGRATION=true deno test --allow-env --allow-net --allow-read \
 *     supabase/functions/generate-report/index.integration-test.ts
 *
 *   # Test a specific provider:
 *   INTEGRATION=true AI_PROVIDER=openai deno test --allow-env --allow-net --allow-read \
 *     supabase/functions/generate-report/index.integration-test.ts
 */

import { assertEquals, assert } from "jsr:@std/assert";
import { generateReportFromNotes } from "./index.ts";
import { QUIET_DAY, RESI_RENOVATION } from "./sample-notes.ts";
import type { GeneratedSiteReport } from "./report-schema.ts";

const INTEGRATION = Deno.env.get("INTEGRATION") === "true";
const provider = (Deno.env.get("AI_PROVIDER") ?? "kimi").toLowerCase();

function skipUnlessIntegration() {
  if (!INTEGRATION) {
    return true;
  }
  return false;
}

function assertValidReport(result: GeneratedSiteReport) {
  assert(result.report, "result should have report key");

  // meta
  const { meta } = result.report;
  assert(typeof meta.title === "string" && meta.title.length > 0, "meta.title should be non-empty");
  assert(typeof meta.reportType === "string" && meta.reportType.length > 0, "meta.reportType should be non-empty");
  assert(typeof meta.summary === "string" && meta.summary.length > 0, "meta.summary should be non-empty");
  assert(meta.visitDate === null || typeof meta.visitDate === "string", "meta.visitDate should be string or null");

  // weather: null or object with string/null fields
  if (result.report.weather !== null) {
    const w = result.report.weather;
    assert(w.conditions === null || typeof w.conditions === "string", "weather.conditions type");
    assert(w.temperature === null || typeof w.temperature === "string", "weather.temperature type");
  }

  // manpower: null or valid object
  if (result.report.manpower !== null) {
    const m = result.report.manpower;
    assert(m.totalWorkers === null || typeof m.totalWorkers === "number", "manpower.totalWorkers type");
    assert(Array.isArray(m.roles), "manpower.roles should be array");
  }

  // activities
  assert(Array.isArray(result.report.activities), "activities should be array");
  for (const activity of result.report.activities) {
    assert(typeof activity.name === "string" && activity.name.length > 0, "activity.name should be non-empty");
    assert(typeof activity.status === "string", "activity.status should be string");
    assert(typeof activity.summary === "string", "activity.summary should be string");
    assert(Array.isArray(activity.sourceNoteIndexes), "activity.sourceNoteIndexes should be array");
    assert(Array.isArray(activity.materials), "activity.materials should be array");
    assert(Array.isArray(activity.equipment), "activity.equipment should be array");
    assert(Array.isArray(activity.issues), "activity.issues should be array");
    assert(Array.isArray(activity.observations), "activity.observations should be array");
  }

  // issues
  assert(Array.isArray(result.report.issues), "issues should be array");
  for (const issue of result.report.issues) {
    assert(typeof issue.title === "string", "issue.title should be string");
    assert(typeof issue.severity === "string", "issue.severity should be string");
  }

  // siteConditions, nextSteps, sections
  assert(Array.isArray(result.report.siteConditions), "siteConditions should be array");
  assert(Array.isArray(result.report.nextSteps), "nextSteps should be array");
  assert(Array.isArray(result.report.sections), "sections should be array");
}

// ---------------------------------------------------------------------------
// API reachability tests — always run (no INTEGRATION flag needed)
// ---------------------------------------------------------------------------

const PROVIDER_ENDPOINTS: Record<string, string> = {
  openai: "https://api.openai.com/v1/models",
  anthropic: "https://api.anthropic.com/v1/messages",
  google: "https://generativelanguage.googleapis.com/v1/models",
  kimi: "https://api.moonshot.cn/v1/models",
};

async function checkReachable(
  url: string,
  timeoutMs = 10_000,
): Promise<{ reachable: boolean; status: number; error?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
    });
    clearTimeout(timer);
    // Consume body to avoid Deno resource leak detection
    await response.body?.cancel();
    return { reachable: true, status: response.status };
  } catch (err) {
    clearTimeout(timer);
    const message = err instanceof Error ? err.message : String(err);
    return { reachable: false, status: 0, error: message };
  }
}

for (const [name, url] of Object.entries(PROVIDER_ENDPOINTS)) {
  Deno.test({
    name: `[reachability] ${name} API endpoint is reachable (${new URL(url).hostname})`,
    async fn() {
      const result = await checkReachable(url);

      console.log(
        `  → ${name}: ${result.reachable ? `reachable (HTTP ${result.status})` : `unreachable — ${result.error}`}`,
      );

      // A reachable endpoint returns any HTTP status (even 401/403/404).
      // An unreachable one throws a network/TLS error.
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

// ---------------------------------------------------------------------------
// Full generation tests
// ---------------------------------------------------------------------------

Deno.test({
  name: `[${provider}] full generation — quiet day (small note set)`,
  ignore: skipUnlessIntegration(),
  async fn() {
    const result = await generateReportFromNotes(QUIET_DAY, { provider });

    assertValidReport(result);
    assert(result.report.activities.length >= 1, "should produce at least 1 activity");
    console.log(
      `  → ${result.report.activities.length} activities, ${result.report.sections.length} sections`,
    );
  },
});

Deno.test({
  name: `[${provider}] full generation — resi renovation (medium note set)`,
  ignore: skipUnlessIntegration(),
  async fn() {
    const result = await generateReportFromNotes(RESI_RENOVATION, { provider });

    assertValidReport(result);
    assert(result.report.activities.length >= 1, "should produce at least 1 activity");
    // Renovation notes mention asbestos concern — should appear somewhere
    const allText = JSON.stringify(result).toLowerCase();
    assert(
      allText.includes("asbestos") || allText.includes("fibro"),
      "report should mention the asbestos/fibro concern from the notes",
    );
    console.log(
      `  → ${result.report.activities.length} activities, ${result.report.issues.length} issues`,
    );
  },
});

// ---------------------------------------------------------------------------
// Incremental generation test
// ---------------------------------------------------------------------------

Deno.test({
  name: `[${provider}] incremental generation — adds to existing report`,
  ignore: skipUnlessIntegration(),
  async fn() {
    // Step 1: Generate a base report from a few notes
    const baseNotes = QUIET_DAY.slice(0, 4);
    const baseReport = await generateReportFromNotes(baseNotes, { provider });
    assertValidReport(baseReport);

    const baseActivityCount = baseReport.report.activities.length;
    console.log(`  → base: ${baseActivityCount} activities`);

    // Step 2: Incrementally update with all notes
    const updatedReport = await generateReportFromNotes(
      QUIET_DAY,
      { provider },
      baseReport,
    );

    assertValidReport(updatedReport);

    // Original activities should still be there (never removed)
    assert(
      updatedReport.report.activities.length >= baseActivityCount,
      `should have at least ${baseActivityCount} activities after incremental update, got ${updatedReport.report.activities.length}`,
    );

    console.log(
      `  → updated: ${updatedReport.report.activities.length} activities, ${updatedReport.report.sections.length} sections`,
    );
  },
});

// ---------------------------------------------------------------------------
// Schema robustness — real model output parses cleanly
// ---------------------------------------------------------------------------

Deno.test({
  name: `[${provider}] model output has all required top-level keys`,
  ignore: skipUnlessIntegration(),
  async fn() {
    const result = await generateReportFromNotes(
      ["sunny day, 22 degrees, no wind. just me on site doing a quick check. everything looks fine."],
      { provider },
    );

    assertValidReport(result);

    // Verify every top-level key exists (not just from the type but at runtime)
    const keys = Object.keys(result.report);
    for (const expected of [
      "meta", "weather", "manpower", "siteConditions",
      "activities", "issues", "nextSteps", "sections",
    ]) {
      assert(keys.includes(expected), `missing top-level key: ${expected}`);
    }
  },
});

// ---------------------------------------------------------------------------
// sourceNoteIndexes validation
// ---------------------------------------------------------------------------

Deno.test({
  name: `[${provider}] sourceNoteIndexes reference valid note numbers`,
  ignore: skipUnlessIntegration(),
  async fn() {
    const notes = QUIET_DAY;
    const result = await generateReportFromNotes(notes, { provider });

    assertValidReport(result);

    const maxIndex = notes.length;

    for (const activity of result.report.activities) {
      for (const idx of activity.sourceNoteIndexes) {
        assert(
          idx >= 1 && idx <= maxIndex,
          `activity "${activity.name}" has out-of-range sourceNoteIndex ${idx} (max: ${maxIndex})`,
        );
      }
    }

    for (const section of result.report.sections) {
      for (const idx of section.sourceNoteIndexes) {
        assert(
          idx >= 1 && idx <= maxIndex,
          `section "${section.title}" has out-of-range sourceNoteIndex ${idx} (max: ${maxIndex})`,
        );
      }
    }
  },
});
