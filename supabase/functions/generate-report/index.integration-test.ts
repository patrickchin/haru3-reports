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
import {
  QUIET_DAY,
  RESI_RENOVATION,
  COMMERCIAL_BUILD_DAY,
  ROAD_WORKS,
  HIGHRISE_POUR,
  INTERIOR_FITOUT,
  MESSY_TRANSCRIPTION,
  RAMBLING_NOTES,
  TECHNICAL_NOTES,
  MATERIALS_HEAVY_DAY,
  EQUIPMENT_HEAVY_DAY,
  DELIVERY_TRACKING_DAY,
  PLANT_INTENSIVE_DAY,
  MATERIALS_QUALITY_ISSUES,
  WAREHOUSE_BUILD,
  EARTHWORKS_DAY,
} from "./sample-notes.ts";
import type { GeneratedSiteReport } from "./report-schema.ts";

const INTEGRATION = Deno.env.get("INTEGRATION") === "true";
const provider = (Deno.env.get("AI_PROVIDER") ?? "kimi").toLowerCase();

function skipUnlessIntegration() {
  if (!INTEGRATION) {
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Shared assertion helpers
// ---------------------------------------------------------------------------

interface AssertReportOpts {
  /** When true, meta.title / reportType / summary must also be non-empty. Default: false. */
  requireMeta?: boolean;
}

function assertValidReport(result: GeneratedSiteReport, opts: AssertReportOpts = {}) {
  const { requireMeta = false } = opts;
  assert(result.report, "result should have report key");

  // meta
  const { meta } = result.report;
  assert(typeof meta.title === "string", "meta.title should be a string");
  assert(typeof meta.reportType === "string", "meta.reportType should be a string");
  assert(typeof meta.summary === "string", "meta.summary should be a string");
  if (requireMeta) {
    assert(meta.title.length > 0, "meta.title should be non-empty");
    assert(meta.reportType.length > 0, "meta.reportType should be non-empty");
    assert(meta.summary.length > 0, "meta.summary should be non-empty");
  }
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

/** Assert the report JSON (lowercased) contains at least one of the given keywords. */
function assertReportMentions(
  result: GeneratedSiteReport,
  keywords: string[],
  message: string,
) {
  const allText = JSON.stringify(result).toLowerCase();
  const found = keywords.some((kw) => allText.includes(kw.toLowerCase()));
  assert(found, `${message} — expected one of [${keywords.join(", ")}] in report`);
}

/** Assert the report has activities with non-empty materials arrays. */
function assertHasMaterials(result: GeneratedSiteReport, minCount = 1) {
  const totalMaterials = result.report.activities.reduce(
    (sum, a) => sum + a.materials.length,
    0,
  );
  assert(
    totalMaterials >= minCount,
    `expected at least ${minCount} material(s) across activities, got ${totalMaterials}`,
  );
}

/** Assert the report has activities with non-empty equipment arrays. */
function assertHasEquipment(result: GeneratedSiteReport, minCount = 1) {
  const totalEquipment = result.report.activities.reduce(
    (sum, a) => sum + a.equipment.length,
    0,
  );
  assert(
    totalEquipment >= minCount,
    `expected at least ${minCount} equipment item(s) across activities, got ${totalEquipment}`,
  );
}

/** Assert there are issues (activity-level + top-level combined). */
function assertHasIssues(result: GeneratedSiteReport, minCount = 1) {
  const activityIssues = result.report.activities.reduce(
    (sum, a) => sum + a.issues.length,
    0,
  );
  const total = result.report.issues.length + activityIssues;
  assert(
    total >= minCount,
    `expected at least ${minCount} issue(s), got ${total} (${result.report.issues.length} top-level + ${activityIssues} activity-level)`,
  );
}

/** Assert weather was extracted. */
function assertHasWeather(result: GeneratedSiteReport) {
  assert(result.report.weather !== null, "expected weather to be populated");
}

/** Assert manpower was extracted. */
function assertHasManpower(result: GeneratedSiteReport) {
  assert(result.report.manpower !== null, "expected manpower to be populated");
}

/** Assert sourceNoteIndexes are in valid range for all activities and sections. */
function assertValidSourceIndexes(result: GeneratedSiteReport, noteCount: number) {
  for (const activity of result.report.activities) {
    for (const idx of activity.sourceNoteIndexes) {
      assert(
        idx >= 1 && idx <= noteCount,
        `activity "${activity.name}" has out-of-range sourceNoteIndex ${idx} (max: ${noteCount})`,
      );
    }
  }
  for (const section of result.report.sections) {
    for (const idx of section.sourceNoteIndexes) {
      assert(
        idx >= 1 && idx <= noteCount,
        `section "${section.title}" has out-of-range sourceNoteIndex ${idx} (max: ${noteCount})`,
      );
    }
  }
}

function logReportSummary(result: GeneratedSiteReport) {
  const allMaterials = result.report.activities.reduce((s, a) => s + a.materials.length, 0);
  const allEquipment = result.report.activities.reduce((s, a) => s + a.equipment.length, 0);
  const allActivityIssues = result.report.activities.reduce((s, a) => s + a.issues.length, 0);
  console.log(
    `  → ${result.report.activities.length} activities, ` +
    `${result.report.issues.length}+${allActivityIssues} issues, ` +
    `${allMaterials} materials, ${allEquipment} equipment, ` +
    `${result.report.sections.length} sections, ` +
    `weather=${result.report.weather !== null}, ` +
    `manpower=${result.report.manpower?.totalWorkers ?? "null"}`,
  );
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
// Generation — small / simple note sets
// ===========================================================================

Deno.test({
  name: `[${provider}] generation — quiet day (9 notes, minimal activity)`,
  ignore: skipUnlessIntegration(),
  async fn() {
    const result = await generateReportFromNotes(QUIET_DAY, { provider });

    assertValidReport(result);
    assertValidSourceIndexes(result, QUIET_DAY.length);
    assert(result.report.activities.length >= 1, "should produce at least 1 activity");
    assertHasWeather(result);
    assertReportMentions(result, ["sunny", "24"], "weather details from notes");
    assertReportMentions(result, ["fire extinguisher", "extinguisher"], "fire extinguisher check");
    logReportSummary(result);
  },
});

Deno.test({
  name: `[${provider}] generation — single minimal note`,
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
  name: `[${provider}] generation — technical notes (precise measurements)`,
  ignore: skipUnlessIntegration(),
  async fn() {
    const result = await generateReportFromNotes(TECHNICAL_NOTES, { provider });

    assertValidReport(result);
    assertValidSourceIndexes(result, TECHNICAL_NOTES.length);
    assert(result.report.activities.length >= 1, "should produce at least 1 activity");
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
  name: `[${provider}] generation — resi renovation (17 notes, asbestos concern)`,
  ignore: skipUnlessIntegration(),
  async fn() {
    const result = await generateReportFromNotes(RESI_RENOVATION, { provider });

    assertValidReport(result);
    assertValidSourceIndexes(result, RESI_RENOVATION.length);
    assert(result.report.activities.length >= 1, "should produce at least 1 activity");
    assertReportMentions(result, ["asbestos", "fibro"], "should mention asbestos/fibro concern");
    assertReportMentions(result, ["knob and tube", "wiring", "electrical"], "should mention old wiring");
    assertHasIssues(result, 1);
    assertHasWeather(result);
    logReportSummary(result);
  },
});

Deno.test({
  name: `[${provider}] generation — interior fitout (20 notes, clashes and snag list)`,
  ignore: skipUnlessIntegration(),
  async fn() {
    const result = await generateReportFromNotes(INTERIOR_FITOUT, { provider });

    assertValidReport(result);
    assertValidSourceIndexes(result, INTERIOR_FITOUT.length);
    assert(result.report.activities.length >= 3, "fitout should produce multiple trade activities");
    assertReportMentions(result, ["sprinkler", "fire"], "sprinkler installation");
    assertReportMentions(result, ["clash", "diffuser", "hvac"], "clash between services");
    assertReportMentions(result, ["snag", "defect", "touch up"], "snag list / defects");
    assertReportMentions(result, ["carpet", "fossil", "tile"], "carpet tile details");
    logReportSummary(result);
  },
});

Deno.test({
  name: `[${provider}] generation — messy transcription (11 notes, voice errors)`,
  ignore: skipUnlessIntegration(),
  async fn() {
    const result = await generateReportFromNotes(MESSY_TRANSCRIPTION, { provider });

    assertValidReport(result);
    assertValidSourceIndexes(result, MESSY_TRANSCRIPTION.length);
    assert(result.report.activities.length >= 1, "should extract activities from messy notes");
    assertReportMentions(result, ["near", "close", "storm"], "pipe near-miss (not 'through')");
    assertReportMentions(result, ["waterproof", "membrane", "150mm", "100mm"], "waterproofing issue");
    assertReportMentions(result, ["bracket", "facade", "150", "100", "reject"], "rejected delivery");
    assertHasIssues(result, 1);
    logReportSummary(result);
  },
});

Deno.test({
  name: `[${provider}] generation — rambling notes (3 long-winded notes)`,
  ignore: skipUnlessIntegration(),
  async fn() {
    const result = await generateReportFromNotes(RAMBLING_NOTES, { provider });

    assertValidReport(result);
    assertValidSourceIndexes(result, RAMBLING_NOTES.length);
    assert(result.report.activities.length >= 2, "should extract multiple activities from rambling text");
    assertReportMentions(result, ["brick", "brickl"], "bricklaying activity");
    assertReportMentions(result, ["plumb", "stormwater", "sewer", "fall", "1 in 100"], "plumbing issue");
    assertReportMentions(result, ["skip", "waste", "rubbish", "glass"], "site cleanup issues");
    logReportSummary(result);
  },
});

Deno.test({
  name: `[${provider}] generation — materials quality issues (11 notes, rejections)`,
  ignore: skipUnlessIntegration(),
  async fn() {
    const result = await generateReportFromNotes(MATERIALS_QUALITY_ISSUES, { provider });

    assertValidReport(result);
    assertValidSourceIndexes(result, MATERIALS_QUALITY_ISSUES.length);
    assertHasIssues(result, 2);
    assertReportMentions(result, ["slump", "180", "reject", "concrete"], "rejected concrete truck");
    assertReportMentions(result, ["tile", "300x300", "600x600", "wrong"], "wrong tile size");
    assertReportMentions(result, ["expir", "adhesive", "use by"], "expired adhesive");
    logReportSummary(result);
  },
});

// ===========================================================================
// Generation — large note sets (many notes, complex output)
// ===========================================================================

Deno.test({
  name: `[${provider}] generation — commercial build day (50 notes, multi-trade)`,
  ignore: skipUnlessIntegration(),
  async fn() {
    const result = await generateReportFromNotes(COMMERCIAL_BUILD_DAY, { provider });

    assertValidReport(result);
    assertValidSourceIndexes(result, COMMERCIAL_BUILD_DAY.length);

    assert(result.report.activities.length >= 3, "should produce multiple activities for multi-trade day");

    assertHasWeather(result);
    assertReportMentions(result, ["12 degrees", "12°", "overcast"], "morning weather");

    assertHasManpower(result);

    // Self-correction: notes say "40 MPA" then correct to "32 MPA"
    assertReportMentions(result, ["32"], "should use corrected concrete spec (32 MPA not 40)");

    assertReportMentions(result, ["concrete", "pour", "zone b"], "concrete pour activity");
    assertReportMentions(result, ["precast", "panel"], "precast panel activity");
    assertReportMentions(result, ["hammer", "drop", "near miss", "incident", "lanyard"], "dropped hammer near-miss");
    assertReportMentions(result, ["crane", "hydraulic", "leak"], "crane hydraulic issue");

    assertHasMaterials(result, 1);
    assertHasEquipment(result, 1);
    assertHasIssues(result, 1);
    logReportSummary(result);
  },
});

Deno.test({
  name: `[${provider}] generation — road works (25 notes, services clash)`,
  ignore: skipUnlessIntegration(),
  async fn() {
    const result = await generateReportFromNotes(ROAD_WORKS, { provider });

    assertValidReport(result);
    assertValidSourceIndexes(result, ROAD_WORKS.length);
    assert(result.report.activities.length >= 2, "should produce multiple activities");

    assertHasWeather(result);
    assertReportMentions(result, ["rain", "pump", "water", "trench"], "rain/pumping impact");

    assertHasIssues(result, 1);
    assertReportMentions(result, ["telstra", "conduit", "service", "locator"], "Telstra services clash");
    assertReportMentions(result, ["compact", "99%", "proctor"], "compaction test passed");

    assertHasEquipment(result, 1);
    assertHasManpower(result);
    logReportSummary(result);
  },
});

Deno.test({
  name: `[${provider}] generation — highrise pour (28 notes, time-sensitive)`,
  ignore: skipUnlessIntegration(),
  async fn() {
    const result = await generateReportFromNotes(HIGHRISE_POUR, { provider });

    assertValidReport(result);
    assertValidSourceIndexes(result, HIGHRISE_POUR.length);
    assert(result.report.activities.length >= 1, "should produce at least 1 activity");

    assertReportMentions(result, ["23", "column"], "23 columns");
    assertReportMentions(result, ["slump", "80"], "slump test result");

    assertHasWeather(result);
    assertReportMentions(result, ["8 degree", "8°", "cold", "accelerator"], "cold weather curing");

    assertReportMentions(result, ["pump", "block", "clear"], "pump blockage incident");
    assertReportMentions(result, ["cylinder", "test", "7 day", "28 day"], "test cylinders taken");
    assertReportMentions(result, ["glass", "crack", "safety"], "safety glasses replaced");

    logReportSummary(result);
  },
});

Deno.test({
  name: `[${provider}] generation — materials heavy day (18 notes, lots of materials)`,
  ignore: skipUnlessIntegration(),
  async fn() {
    const result = await generateReportFromNotes(MATERIALS_HEAVY_DAY, { provider });

    assertValidReport(result);
    assertValidSourceIndexes(result, MATERIALS_HEAVY_DAY.length);

    assertHasMaterials(result, 3);
    assertReportMentions(result, ["brick", "2000", "pallet"], "brick delivery");
    assertReportMentions(result, ["timber", "90x", "mgp10", "plywood"], "timber delivery");
    assertReportMentions(result, ["waterproof", "membrane", "ardex", "wpm"], "waterproofing membrane");
    assertReportMentions(result, ["render", "sand", "wrong", "grade", "coarse"], "wrong render sand");
    assertReportMentions(result, ["concrete sealer", "duraseal", "duram"], "concrete sealer");
    assertReportMentions(result, ["plywood", "water", "damage", "torn"], "plywood water damage");

    logReportSummary(result);
  },
});

Deno.test({
  name: `[${provider}] generation — equipment heavy day (19 notes, plant hours)`,
  ignore: skipUnlessIntegration(),
  async fn() {
    const result = await generateReportFromNotes(EQUIPMENT_HEAVY_DAY, { provider });

    assertValidReport(result);
    assertValidSourceIndexes(result, EQUIPMENT_HEAVY_DAY.length);

    assertHasEquipment(result, 3);
    assertReportMentions(result, ["excavator", "cat 313", "313"], "excavator");
    assertReportMentions(result, ["roller", "vibe", "bomag"], "vibe roller");
    assertReportMentions(result, ["bobcat", "skid"], "bobcat/skid steer");

    assertHasIssues(result, 1);
    assertReportMentions(result, ["roller", "broke", "vibrat", "belt"], "roller breakdown");
    assertReportMentions(result, ["pump", "block", "clear"], "pump blockage");
    assertReportMentions(result, ["tyre", "tire", "bald", "bobcat"], "bobcat tyre condition");

    logReportSummary(result);
  },
});

Deno.test({
  name: `[${provider}] generation — delivery tracking day (14 notes, docket numbers)`,
  ignore: skipUnlessIntegration(),
  async fn() {
    const result = await generateReportFromNotes(DELIVERY_TRACKING_DAY, { provider });

    assertValidReport(result);
    assertValidSourceIndexes(result, DELIVERY_TRACKING_DAY.length);

    assertHasMaterials(result, 3);
    assertReportMentions(result, ["concrete", "32mpa", "32 mpa"], "concrete spec");
    assertReportMentions(result, ["reject", "wrong site", "beaumont"], "rejected tile delivery");
    assertReportMentions(result, ["reece", "missing", "elbow"], "missing plumbing fittings");
    assertReportMentions(result, ["steel", "reinforc", "onesteel", "reo"], "steel delivery");

    logReportSummary(result);
  },
});

Deno.test({
  name: `[${provider}] generation — plant intensive day (16 notes, 6 machines)`,
  ignore: skipUnlessIntegration(),
  async fn() {
    const result = await generateReportFromNotes(PLANT_INTENSIVE_DAY, { provider });

    assertValidReport(result);
    assertValidSourceIndexes(result, PLANT_INTENSIVE_DAY.length);

    assertHasEquipment(result, 3);
    assertReportMentions(result, ["cat 320", "20 tonne", "excavator"], "20t excavator");
    assertReportMentions(result, ["kubota", "kx080", "8 tonne"], "8t excavator");
    assertReportMentions(result, ["franna", "crane", "25 tonne"], "25t mobile crane");
    assertReportMentions(result, ["concrete pump", "36m", "boom"], "concrete pump");

    assertHasIssues(result, 1);
    assertReportMentions(result, ["hydraulic", "hose", "kubota"], "hydraulic hose blowout");
    assertReportMentions(result, ["$180", "$380", "$450", "$990", "hire", "cost"], "equipment costs");

    logReportSummary(result);
  },
});

Deno.test({
  name: `[${provider}] generation — warehouse build (16 notes, heavy steel)`,
  ignore: skipUnlessIntegration(),
  async fn() {
    const result = await generateReportFromNotes(WAREHOUSE_BUILD, { provider });

    assertValidReport(result);
    assertValidSourceIndexes(result, WAREHOUSE_BUILD.length);
    assert(result.report.activities.length >= 1, "should produce at least 1 activity");

    assertReportMentions(result, ["portal", "frame", "steel"], "portal frame erection");
    assertReportMentions(result, ["310uc", "460ub", "uc97", "ub67"], "steel member sizes");

    assertHasIssues(result, 1);
    assertReportMentions(result, ["bolt", "hole", "align", "m24", "m20", "drill"], "bolt misalignment");
    assertReportMentions(result, ["purlin", "c200", "girt"], "purlins/girts");

    assertHasEquipment(result, 1);
    assertHasMaterials(result, 1);
    logReportSummary(result);
  },
});

Deno.test({
  name: `[${provider}] generation — earthworks day (14 notes, bulk quantities)`,
  ignore: skipUnlessIntegration(),
  async fn() {
    const result = await generateReportFromNotes(EARTHWORKS_DAY, { provider });

    assertValidReport(result);
    assertValidSourceIndexes(result, EARTHWORKS_DAY.length);

    assertHasEquipment(result, 3);
    assertReportMentions(result, ["hitachi", "zx300", "30 tonne"], "30t excavator");
    assertReportMentions(result, ["d6", "dozer"], "D6 dozer");
    assertReportMentions(result, ["padfoot", "roller", "18 tonne"], "padfoot roller");
    assertReportMentions(result, ["compact", "96%", "97%", "98%", "mdd", "95%"], "compaction test results");
    assertReportMentions(result, ["diesel", "900", "fuel", "litre"], "fuel consumption");
    assertReportMentions(result, ["500", "800", "cubic", "metre", "m3"], "earthwork volumes");

    assertHasManpower(result);
    logReportSummary(result);
  },
});

// ===========================================================================
// Self-correction handling
// ===========================================================================

Deno.test({
  name: `[${provider}] self-correction — "40 MPA wait no 32" should use corrected value`,
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
  name: `[${provider}] self-correction — "8 panels, hang on 5 north 3 east"`,
  ignore: skipUnlessIntegration(),
  async fn() {
    const notes = [
      "delivery truck just showed up with the precast panels. 8 panels total, theyre for the north wall level 2",
      "hang on thats not right, its 8 panels for the north AND east walls. 5 north 3 east",
      "all panels installed successfully",
    ];
    const result = await generateReportFromNotes(notes, { provider });

    assertValidReport(result);
    assertReportMentions(result, ["5", "north"], "should mention 5 panels for north");
    assertReportMentions(result, ["3", "east"], "should mention 3 panels for east");
    logReportSummary(result);
  },
});

// ===========================================================================
// Edge-case inputs
// ===========================================================================

Deno.test({
  name: `[${provider}] edge case — single very short note`,
  ignore: skipUnlessIntegration(),
  async fn() {
    const result = await generateReportFromNotes(
      ["scaffolding is up on the east side"],
      { provider },
    );

    assertValidReport(result);
    assertValidSourceIndexes(result, 1);
    assert(result.report.activities.length >= 1, "should produce at least 1 activity");
    assertReportMentions(result, ["scaffold", "east"], "scaffolding on east side");
    logReportSummary(result);
  },
});

Deno.test({
  name: `[${provider}] edge case — notes with only weather and no activities`,
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
    assertReportMentions(result, ["rain", "14", "wind", "40"], "weather details");
    assertReportMentions(result, ["waterlog", "home", "no work", "cancel", "stop"], "site shutdown");
    logReportSummary(result);
  },
});

Deno.test({
  name: `[${provider}] edge case — notes with lots of numbers and measurements`,
  ignore: skipUnlessIntegration(),
  async fn() {
    const result = await generateReportFromNotes(
      [
        "slab is 200mm thick, N12 at 200 centres each way top and bottom",
        "chairs at 1200 centres supporting the top mat. cover is 40mm top 30mm bottom",
        "the opening at grid C4 is 3600 x 2400 with a 310UB40 lintel. 150mm bearing each end",
      ],
      { provider },
    );

    assertValidReport(result);
    assertReportMentions(result, ["200mm", "n12", "200 centre"], "slab reinforcement details");
    assertReportMentions(result, ["310ub", "lintel", "3600", "2400"], "lintel specification");
    logReportSummary(result);
  },
});

// ===========================================================================
// Incremental generation tests
// ===========================================================================

Deno.test({
  name: `[${provider}] incremental — quiet day: base from 4 notes, update with all 9`,
  ignore: skipUnlessIntegration(),
  async fn() {
    const baseNotes = QUIET_DAY.slice(0, 4);
    const baseReport = await generateReportFromNotes(baseNotes, { provider });
    assertValidReport(baseReport);

    const baseActivityCount = baseReport.report.activities.length;
    console.log(`  → base: ${baseActivityCount} activities`);

    const updatedReport = await generateReportFromNotes(
      QUIET_DAY,
      { provider },
      baseReport,
    );

    assertValidReport(updatedReport);
    assert(
      updatedReport.report.activities.length >= baseActivityCount,
      `should have at least ${baseActivityCount} activities after update, got ${updatedReport.report.activities.length}`,
    );
    assertReportMentions(updatedReport, ["fire extinguisher", "extinguisher"], "fire extinguisher check from new notes");
    logReportSummary(updatedReport);
  },
});

Deno.test({
  name: `[${provider}] incremental — commercial build: base from morning notes, update with full day`,
  ignore: skipUnlessIntegration(),
  async fn() {
    const morningNotes = COMMERCIAL_BUILD_DAY.slice(0, 15);
    const baseReport = await generateReportFromNotes(morningNotes, { provider });
    assertValidReport(baseReport);
    console.log(`  → base: ${baseReport.report.activities.length} activities`);

    const fullReport = await generateReportFromNotes(
      COMMERCIAL_BUILD_DAY,
      { provider },
      baseReport,
    );

    assertValidReport(fullReport);
    assert(
      fullReport.report.activities.length >= baseReport.report.activities.length,
      "should not lose activities on incremental update",
    );
    assertReportMentions(fullReport, ["precast", "panel"], "precast panels from afternoon");
    assertReportMentions(fullReport, ["hammer", "drop", "near miss", "incident"], "dropped hammer from afternoon");
    logReportSummary(fullReport);
  },
});

Deno.test({
  name: `[${provider}] incremental — materials heavy: base from deliveries, update with usage + issues`,
  ignore: skipUnlessIntegration(),
  async fn() {
    const deliveryNotes = MATERIALS_HEAVY_DAY.slice(0, 5);
    const baseReport = await generateReportFromNotes(deliveryNotes, { provider });
    assertValidReport(baseReport);
    console.log(`  → base: ${baseReport.report.activities.length} activities`);

    const fullReport = await generateReportFromNotes(
      MATERIALS_HEAVY_DAY,
      { provider },
      baseReport,
    );

    assertValidReport(fullReport);
    assertHasMaterials(fullReport, 2);
    assertReportMentions(fullReport, ["render", "sand", "wrong"], "wrong render sand from later notes");
    logReportSummary(fullReport);
  },
});

Deno.test({
  name: `[${provider}] incremental — road works: base without Telstra, update with Telstra issue`,
  ignore: skipUnlessIntegration(),
  async fn() {
    const beforeTelstra = ROAD_WORKS.slice(0, 13);
    const baseReport = await generateReportFromNotes(beforeTelstra, { provider });
    assertValidReport(baseReport);
    console.log(`  → base: ${baseReport.report.activities.length} activities, ${baseReport.report.issues.length} issues`);

    const fullReport = await generateReportFromNotes(
      ROAD_WORKS,
      { provider },
      baseReport,
    );

    assertValidReport(fullReport);
    assertHasIssues(fullReport, 1);
    assertReportMentions(fullReport, ["telstra", "conduit", "service", "relocat"], "Telstra issue should appear after incremental update");
    logReportSummary(fullReport);
  },
});

// ===========================================================================
// Incremental idempotency — updating with the same notes should not
// materially change the report
// ===========================================================================

Deno.test({
  name: `[${provider}] incremental idempotency — same notes produce stable report`,
  ignore: skipUnlessIntegration(),
  async fn() {
    const notes = QUIET_DAY;
    const original = await generateReportFromNotes(notes, { provider });
    assertValidReport(original);

    const updated = await generateReportFromNotes(notes, { provider }, original);
    assertValidReport(updated);

    assert(
      updated.report.activities.length >= original.report.activities.length,
      `activity count should not decrease: was ${original.report.activities.length}, now ${updated.report.activities.length}`,
    );
    assert(
      updated.report.issues.length >= original.report.issues.length,
      `issue count should not decrease: was ${original.report.issues.length}, now ${updated.report.issues.length}`,
    );
    assert(updated.report.meta.title.length > 0, "title should still be non-empty");
    assert(updated.report.meta.summary.length > 0, "summary should still be non-empty");

    console.log(
      `  → original: ${original.report.activities.length} activities, ` +
      `updated: ${updated.report.activities.length} activities`,
    );
  },
});

// ===========================================================================
// Cross-note-type incremental — start with one type, add another
// ===========================================================================

Deno.test({
  name: `[${provider}] incremental cross-type — quiet day base, add technical notes`,
  ignore: skipUnlessIntegration(),
  async fn() {
    const baseReport = await generateReportFromNotes(QUIET_DAY, { provider });
    assertValidReport(baseReport);
    console.log(`  → base: ${baseReport.report.activities.length} activities`);

    const combinedNotes = [...QUIET_DAY, ...TECHNICAL_NOTES];
    const updated = await generateReportFromNotes(
      combinedNotes,
      { provider },
      baseReport,
    );

    assertValidReport(updated);
    assertValidSourceIndexes(updated, combinedNotes.length);

    assertReportMentions(updated, ["sunny", "cleanup", "fire extinguisher"], "quiet day content preserved");
    assertReportMentions(updated, ["compaction", "mdd", "mpa"], "technical content added");

    assert(
      updated.report.activities.length > baseReport.report.activities.length,
      "should have more activities after adding technical notes",
    );

    logReportSummary(updated);
  },
});
