/**
 * Shared assertion helpers for integration tests.
 */

import { assert } from "jsr:@std/assert";
import type { GeneratedSiteReport } from "./report-schema.ts";
import type { GenerateResult } from "./index.ts";

type ReportInput = GenerateResult | GeneratedSiteReport;
function getReport(input: ReportInput): GeneratedSiteReport {
  return "usage" in input
    ? (input as GenerateResult).report
    : (input as GeneratedSiteReport);
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

  if (result.report.workers !== null) {
    const m = result.report.workers;
    assert(m.totalWorkers === null || typeof m.totalWorkers === "number", "workers.totalWorkers type");
    assert(Array.isArray(m.roles), "workers.roles should be array");
  }

  assert(Array.isArray(result.report.materials), "materials should be array");
  for (const material of result.report.materials) {
    assert(typeof material.name === "string" && material.name.length > 0, "material.name should be non-empty");
  }

  assert(Array.isArray(result.report.issues), "issues should be array");
  for (const issue of result.report.issues) {
    assert(typeof issue.title === "string", "issue.title should be string");
    assert(typeof issue.severity === "string", "issue.severity should be string");
  }

  assert(Array.isArray(result.report.nextSteps), "nextSteps should be array");
  assert(Array.isArray(result.report.sections), "sections should be array");
  for (const section of result.report.sections) {
    assert(typeof section.title === "string" && section.title.length > 0, "section.title should be non-empty");
    assert(typeof section.content === "string", "section.content should be string");
    assert(Array.isArray(section.sourceNoteIndexes), "section.sourceNoteIndexes should be array");
  }
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
  assert(
    result.report.materials.length >= minCount,
    `expected at least ${minCount} material(s), got ${result.report.materials.length}`,
  );
}

export function assertHasIssues(input: ReportInput, minCount = 1) {
  const result = getReport(input);
  assert(
    result.report.issues.length >= minCount,
    `expected at least ${minCount} issue(s), got ${result.report.issues.length}`,
  );
}

export function assertHasWeather(input: ReportInput) {
  const result = getReport(input);
  assert(result.report.weather !== null, "expected weather to be populated");
}

export function assertHasWorkers(input: ReportInput) {
  const result = getReport(input);
  assert(result.report.workers !== null, "expected workers to be populated");
}

export function assertValidSourceIndexes(input: ReportInput, noteCount: number) {
  const result = getReport(input);
  for (const section of result.report.sections) {
    for (const idx of section.sourceNoteIndexes) {
      assert(
        idx >= 1 && idx <= noteCount,
        `section "${section.title}" has out-of-range sourceNoteIndex ${idx} (max: ${noteCount})`,
      );
    }
  }
  for (const issue of result.report.issues) {
    for (const idx of issue.sourceNoteIndexes) {
      assert(
        idx >= 1 && idx <= noteCount,
        `issue "${issue.title}" has out-of-range sourceNoteIndex ${idx} (max: ${noteCount})`,
      );
    }
  }
}

export function logReportSummary(input: ReportInput) {
  const result = getReport(input);
  console.log(
    `  → ${result.report.sections.length} sections, ` +
    `${result.report.materials.length} materials, ` +
    `${result.report.issues.length} issues, ` +
    `weather=${result.report.weather !== null}, ` +
    `workers=${result.report.workers?.totalWorkers ?? "null"}`,
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
  zai: "https://api.z.ai/api/paas/v4/models",
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
