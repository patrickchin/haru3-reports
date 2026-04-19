import { formatDate, getItemMeta, toTitleCase } from "@/lib/report-helpers";

export type ProjectReportListItem = {
  id: string;
  title: string;
  report_type: string;
  status: string;
  visit_date: string | null;
  created_at: string;
};

export type ProjectReportsSection = {
  key: "reports";
  title: "Reports";
  data: ProjectReportListItem[];
};

export function buildProjectReportsSections(
  reports: ProjectReportListItem[]
): ProjectReportsSection[] {
  return [
    {
      key: "reports",
      title: "Reports",
      data: reports,
    },
  ];
}

export function getProjectReportsScreenTitle(
  projectName: string | null | undefined
): string {
  const normalizedProjectName = projectName?.trim();

  return normalizedProjectName && normalizedProjectName.length > 0
    ? normalizedProjectName
    : "Site";
}

export function getProjectReportTitle(report: ProjectReportListItem): string {
  const normalizedTitle = report.title.trim();
  return normalizedTitle.length > 0 ? normalizedTitle : "Untitled Report";
}

export function getProjectReportMeta(report: ProjectReportListItem): string {
  return getItemMeta([
    toTitleCase(report.report_type),
    formatDate(report.visit_date ?? report.created_at),
  ]);
}
