/**
 * Shared assertion helpers for integration tests.
 */

import { assert } from "jsr:@std/assert";
import type { GeneratedSiteReport } from "./report-schema.ts";
import type { GenerateResult } from "./index.ts";

type ReportInput = GenerateResult | GeneratedSiteReport;
function getReport(input: ReportInput): GeneratedSiteReport {
  return "usage" in input ? input.report : input;
}

export const INTEGRATION = Deno.env.get("INTEGRATION") === "true";
export const provider = (Deno.env.get("AI_PROVIDER") ?? "kimi").toLowerCase();

export function skipUnlessIntegration() {
  return !INTEGRATION;
}

// ---------------------------------------------------------------------------
// Assertion helpers
// ---------------------------------------------------------------------------

export interface AssertReportOpts {
  requireMeta?: boolean;
}

export function assertValidReport(input: ReportInput, opts: AssertReportOpts = {}) {
  const result = getReport(input);
  const { requireMeta = false } = opts;
  assert(result.report, "result should have report key");

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

  if (result.report.weather !== null) {
    const w = result.report.weather;
    assert(w.conditions === null || typeof w.conditions === "string", "weather.conditions type");
    assert(w.temperature === null || typeof w.temperature === "string", "weather.temperature type");
  }

  if (result.report.manpower !== null) {
    const m = result.report.manpower;
    assert(m.totalWorkers === null || typeof m.totalWorkers === "number", "manpower.totalWorkers type");
    assert(Array.isArray(m.roles), "manpower.roles should be array");
  }

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

  assert(Array.isArray(result.report.issues), "issues should be array");
  for (const issue of result.report.issues) {
    assert(typeof issue.title === "string", "issue.title should be string");
    assert(typeof issue.severity === "string", "issue.severity should be string");
  }

  assert(Array.isArray(result.report.siteConditions), "siteConditions should be array");
  assert(Array.isArray(result.report.nextSteps), "nextSteps should be array");
  assert(Array.isArray(result.report.sections), "sections should be array");
}

export function assertReportMentions(
  input: ReportInput,
  keywords: string[],
  message: string,
) {
  const allText = JSON.stringify(getReport(input)).toLowerCase();
  const found = keywords.some((kw) => allText.includes(kw.toLowerCase()));
  assert(found, `${message} — expected one of [${keywords.join(", ")}] in report`);
}

export function assertHasMaterials(input: ReportInput, minCount = 1) {
  const result = getReport(input);
  const totalMaterials = result.report.activities.reduce(
    (sum, a) => sum + a.materials.length,
    0,
  );
  assert(
    totalMaterials >= minCount,
    `expected at least ${minCount} material(s) across activities, got ${totalMaterials}`,
  );
}

export function assertHasEquipment(input: ReportInput, minCount = 1) {
  const result = getReport(input);
  const totalEquipment = result.report.activities.reduce(
    (sum, a) => sum + a.equipment.length,
    0,
  );
  assert(
    totalEquipment >= minCount,
    `expected at least ${minCount} equipment item(s) across activities, got ${totalEquipment}`,
  );
}

export function assertHasIssues(input: ReportInput, minCount = 1) {
  const result = getReport(input);
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

export function assertHasWeather(input: ReportInput) {
  const result = getReport(input);
  assert(result.report.weather !== null, "expected weather to be populated");
}

export function assertHasManpower(input: ReportInput) {
  const result = getReport(input);
  assert(result.report.manpower !== null, "expected manpower to be populated");
}

export function assertValidSourceIndexes(input: ReportInput, noteCount: number) {
  const result = getReport(input);
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

export function logReportSummary(input: ReportInput) {
  const result = getReport(input);
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
// Reachability helpers
// ---------------------------------------------------------------------------

export const PROVIDER_ENDPOINTS: Record<string, string> = {
  openai: "https://api.openai.com/v1/models",
  anthropic: "https://api.anthropic.com/v1/messages",
  google: "https://generativelanguage.googleapis.com/v1/models",
  kimi: "https://api.moonshot.cn/v1/models",
};

export async function checkReachable(
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
