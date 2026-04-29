/**
 * Advanced integration tests — complex note sets with detailed content assertions.
 *
 * These tests use larger, messier inputs and check that the LLM
 * extracts specific keywords, materials, issues, and technical details.
 * They may occasionally flake due to LLM non-determinism.
 *
 * Controlled by environment variables:
 *   INTEGRATION=true        — enable these tests (skipped otherwise)
 *   AI_PROVIDER=kimi        — which provider to test (default: kimi)
 *
 * Usage:
 *   INTEGRATION=true deno test --allow-env --allow-net --allow-read \
 *     supabase/functions/generate-report/integration-test-advanced.ts
 */

import { assert } from "jsr:@std/assert";
import { generateReportFromNotes } from "./index.ts";
import {
  QUIET_DAY,
  RESI_RENOVATION,
  COMMERCIAL_BUILD_DAY,
  ROAD_WORKS,
  MESSY_TRANSCRIPTION,
  TECHNICAL_NOTES,
  MATERIALS_QUALITY_ISSUES,
} from "./sample-notes.ts";
import {
  provider,
  skipUnlessIntegration,
  assertValidReport,
  assertValidSourceIndexes,
  assertHasWeather,
  assertHasWorkers,
  assertHasMaterials,
  assertHasIssues,
  assertReportMentions,
  logReportSummary,
} from "./integration-test-helpers.ts";

// ===========================================================================
// Generation — small note sets with keyword assertions
// ===========================================================================

Deno.test({
  name: `[${provider}] advanced — quiet day keyword extraction`,
  ignore: skipUnlessIntegration(),
  async fn() {
    const result = await generateReportFromNotes(QUIET_DAY, { provider });

    assertValidReport(result);
    assertValidSourceIndexes(result, QUIET_DAY.length);
    assertHasWeather(result);
    assertReportMentions(result, ["sunny", "24"], "weather details from notes");
    assertReportMentions(result, ["fire extinguisher", "extinguisher", "fire safety"], "fire extinguisher/safety check");
    logReportSummary(result);
  },
});

Deno.test({
  name: `[${provider}] advanced — technical notes (precise measurements)`,
  ignore: skipUnlessIntegration(),
  async fn() {
    const result = await generateReportFromNotes(TECHNICAL_NOTES, { provider });

    assertValidReport(result);
    assertValidSourceIndexes(result, TECHNICAL_NOTES.length);
    // activities check removed (using sections now);
    assertReportMentions(result, ["40 mpa", "40mpa", "32 mpa", "32mpa", "compaction", "mdd"], "technical specs");
    assertReportMentions(result, ["n12", "n16", "reo", "reinforc"], "reo/steel details");
    assertHasMaterials(result, 1);
    logReportSummary(result);
  },
});

// ===========================================================================
// Generation — medium note sets
// ===========================================================================

Deno.test({
  name: `[${provider}] advanced — resi renovation (17 notes, asbestos concern)`,
  ignore: skipUnlessIntegration(),
  async fn() {
    const result = await generateReportFromNotes(RESI_RENOVATION, { provider });

    assertValidReport(result);
    assertValidSourceIndexes(result, RESI_RENOVATION.length);
    // activities check removed (using sections now);
    assertReportMentions(result, ["asbestos", "fibro"], "should mention asbestos/fibro concern");
    assertReportMentions(result, ["knob and tube", "wiring", "electrical"], "should mention old wiring");
    assertHasIssues(result, 1);
    assertHasWeather(result);
    logReportSummary(result);
  },
});

Deno.test({
  name: `[${provider}] advanced — messy transcription (11 notes, voice errors)`,
  ignore: skipUnlessIntegration(),
  async fn() {
    const result = await generateReportFromNotes(MESSY_TRANSCRIPTION, { provider });

    assertValidReport(result);
    assertValidSourceIndexes(result, MESSY_TRANSCRIPTION.length);
    // activities check removed (using sections now);
    assertReportMentions(result, ["near", "close", "storm"], "pipe near-miss (not 'through')");
    assertReportMentions(result, ["waterproof", "membrane", "150mm", "100mm"], "waterproofing issue");
    assertReportMentions(result, ["bracket", "facade", "150", "100", "reject"], "rejected delivery");
    assertHasIssues(result, 1);
    logReportSummary(result);
  },
});

Deno.test({
  name: `[${provider}] advanced — materials quality issues (11 notes, rejections)`,
  ignore: skipUnlessIntegration(),
  async fn() {
    const result = await generateReportFromNotes(MATERIALS_QUALITY_ISSUES, { provider });

    assertValidReport(result);
    assertValidSourceIndexes(result, MATERIALS_QUALITY_ISSUES.length);
    assertHasIssues(result, 1);
    assertReportMentions(result, ["slump", "180", "reject", "concrete"], "rejected concrete truck");
    assertReportMentions(result, ["tile", "300", "600", "wrong"], "wrong tile size");
    assertReportMentions(result, ["expir", "adhesive", "use by"], "expired adhesive");
    logReportSummary(result);
  },
});

// ===========================================================================
// Generation — large note sets
// ===========================================================================

Deno.test({
  name: `[${provider}] advanced — commercial build day (50 notes, multi-trade)`,
  ignore: skipUnlessIntegration(),
  async fn() {
    const result = await generateReportFromNotes(COMMERCIAL_BUILD_DAY, { provider });

    assertValidReport(result);
    assertValidSourceIndexes(result, COMMERCIAL_BUILD_DAY.length);

    // activities check removed (using sections now);

    assertHasWeather(result);
    assertReportMentions(result, ["12 degrees", "12°", "overcast"], "morning weather");

    assertHasWorkers(result);

    assertReportMentions(result, ["32"], "should use corrected concrete spec (32 MPA not 40)");

    assertReportMentions(result, ["concrete", "pour", "zone b"], "concrete pour activity");
    assertReportMentions(result, ["precast", "panel"], "precast panel activity");
    assertReportMentions(result, ["hammer", "drop", "near miss", "incident", "lanyard"], "dropped hammer near-miss");
    assertReportMentions(result, ["crane", "hydraulic", "leak"], "crane hydraulic issue");

    assertHasMaterials(result, 1);
    assertHasIssues(result, 1);
    logReportSummary(result);
  },
});

Deno.test({
  name: `[${provider}] advanced — road works (25 notes, services clash)`,
  ignore: skipUnlessIntegration(),
  async fn() {
    const result = await generateReportFromNotes(ROAD_WORKS, { provider });

    assertValidReport(result);
    assertValidSourceIndexes(result, ROAD_WORKS.length);
    // activities check removed (using sections now);

    assertHasWeather(result);
    assertReportMentions(result, ["rain", "pump", "water", "trench"], "rain/pumping impact");

    assertHasIssues(result, 1);
    assertReportMentions(result, ["telstra", "conduit", "service", "locator"], "Telstra services clash");
    assertReportMentions(result, ["compact", "99%", "proctor"], "compaction test passed");

    assertHasWorkers(result);
    logReportSummary(result);
  },
});

// ===========================================================================
// Re-generation — the LLM no longer accepts a base report; regeneration is
// always a full rebuild from the current notes.
// ===========================================================================

Deno.test({
  name: `[${provider}] advanced — regenerate with all notes after partial run`,
  ignore: skipUnlessIntegration(),
  async fn() {
    const baseNotes = QUIET_DAY.slice(0, 4);
    const baseReport = await generateReportFromNotes(baseNotes, { provider });
    assertValidReport(baseReport);

    const baseSectionCount = baseReport.report.report.sections.length;
    console.log(`  → base: ${baseSectionCount} sections`);

    const updatedReport = await generateReportFromNotes(QUIET_DAY, { provider });

    assertValidReport(updatedReport);
    assert(
      updatedReport.report.report.sections.length >= baseSectionCount,
      `should have at least ${baseSectionCount} sections after rerun, got ${updatedReport.report.report.sections.length}`,
    );
    assertReportMentions(updatedReport, ["fire extinguisher", "extinguisher", "fire safety"], "fire extinguisher check from later notes");
    logReportSummary(updatedReport);
  },
});
