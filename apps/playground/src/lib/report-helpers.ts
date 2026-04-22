import type { GeneratedSiteReport } from "@harpa/report-core";

export {
  toTitleCase,
  formatDate,
  formatSourceNotes,
  getManpowerLines,
  getWeatherLines,
  getIssueMeta,
  getItemMeta,
  getActivitySummaryChips,
  getReportCompleteness,
} from "@harpa/report-core";

export function getReportStats(report: GeneratedSiteReport) {
  const activityIssues = report.report.activities.reduce(
    (sum, a) => sum + a.issues.length,
    0,
  );
  const totalIssues = report.report.issues.length + activityIssues;

  return [
    {
      label: "Activities",
      value: String(report.report.activities.length),
      tone: "default" as const,
    },
    {
      label: "Issues",
      value: String(totalIssues),
      tone: totalIssues > 0 ? ("warning" as const) : ("default" as const),
    },
    {
      label: "Workers",
      value: report.report.manpower?.totalWorkers !== null
        ? String(report.report.manpower?.totalWorkers ?? "–")
        : "–",
      tone: "default" as const,
    },
  ];
}

export function getIssueSeverityTone(
  severity: string,
): "danger" | "warning" | "neutral" {
  const s = severity.toLowerCase();
  if (s === "high" || s === "critical") return "danger";
  if (s === "medium" || s === "moderate") return "warning";
  return "neutral";
}
