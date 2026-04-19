import type { GeneratedSiteReport } from "@/lib/generated-report";

export type IssueSeverityTone = "danger" | "warning" | "neutral";

export function getIssueSeverityTone(severity: string | null | undefined): IssueSeverityTone {
  switch ((severity ?? "").trim().toLowerCase()) {
    case "high":
    case "critical":
      return "danger";
    case "medium":
      return "warning";
    default:
      return "neutral";
  }
}

export function getReportStats(report: GeneratedSiteReport) {
  const workers = report.report.manpower?.totalWorkers ?? 0;
  const activities = report.report.activities.length;
  const issues = report.report.issues.length;

  return [
    {
      value: workers,
      label: workers === 1 ? "Worker" : "Workers",
      tone: "default" as const,
    },
    {
      value: activities,
      label: activities === 1 ? "Activity" : "Activities",
      tone: "default" as const,
    },
    {
      value: issues,
      label: issues === 1 ? "Issue" : "Issues",
      tone: issues > 0 ? ("warning" as const) : ("default" as const),
    },
  ];
}
