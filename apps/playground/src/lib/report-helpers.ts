import type { GeneratedSiteReport } from "@harpa/report-core";

export {
  toTitleCase,
  formatDate,
  formatSourceNotes,
  getIssueMeta,
  getItemMeta,
} from "@harpa/report-core";

export function getReportStats(report: GeneratedSiteReport) {
  const totalIssues = report.report.issues.length;

  return [
    {
      label: "Sections",
      value: String(report.report.sections.length),
      tone: "default" as const,
    },
    {
      label: "Issues",
      value: String(totalIssues),
      tone: totalIssues > 0 ? ("warning" as const) : ("default" as const),
    },
    {
      label: "Workers",
      value: report.report.workers?.totalWorkers !== null && report.report.workers !== null
        ? String(report.report.workers.totalWorkers)
        : "\u2013",
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
