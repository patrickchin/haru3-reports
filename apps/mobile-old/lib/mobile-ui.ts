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
  const workers = report.report.workers?.totalWorkers ?? 0;
  const materials = report.report.materials.length;
  const issues = report.report.issues.length;

  return [
    {
      value: workers,
      label: workers === 1 ? "Worker" : "Workers",
      tone: "default" as const,
    },
    {
      value: materials,
      label: materials === 1 ? "Material" : "Materials",
      tone: "default" as const,
    },
    {
      value: issues,
      label: issues === 1 ? "Issue" : "Issues",
      tone: issues > 0 ? ("warning" as const) : ("default" as const),
    },
  ];
}
