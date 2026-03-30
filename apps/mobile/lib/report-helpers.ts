import type {
  GeneratedReportActivity,
  GeneratedReportIssue,
  GeneratedReportManpower,
  GeneratedSiteReport,
} from "@/lib/generated-report";

export function toTitleCase(value: string): string {
  return value
    .replace(/[_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

export function formatDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function formatSourceNotes(indexes: number[]): string | null {
  return indexes.length > 0 ? `Source notes: ${indexes.join(", ")}` : null;
}

export function getManpowerLines(
  manpower: GeneratedReportManpower | null
): string[] {
  if (!manpower) {
    return [];
  }

  const lines: string[] = [];

  if (manpower.totalWorkers !== null) {
    lines.push(`${manpower.totalWorkers} workers recorded on site.`);
  }

  if (manpower.workerHours) {
    lines.push(`Worker hours: ${manpower.workerHours}`);
  }

  if (manpower.notes) {
    lines.push(manpower.notes);
  }

  for (const role of manpower.roles) {
    const count = role.count !== null ? `${role.count} ` : "";
    const notes = role.notes ? ` - ${role.notes}` : "";
    lines.push(`${count}${role.role}${notes}`.trim());
  }

  return lines;
}

export function getWeatherLines(report: GeneratedSiteReport): string[] {
  const weather = report.report.weather;
  if (!weather) {
    return [];
  }

  return [
    weather.conditions,
    weather.temperature ? `Temperature: ${weather.temperature}` : null,
    weather.wind ? `Wind: ${weather.wind}` : null,
    weather.impact ? `Impact: ${weather.impact}` : null,
  ].filter(Boolean) as string[];
}

export function getIssueMeta(issue: GeneratedReportIssue): string {
  return [issue.category, issue.severity, issue.status]
    .filter(Boolean)
    .map(toTitleCase)
    .join(" • ");
}

export function getItemMeta(values: Array<string | null>): string {
  return values.filter(Boolean).join(" • ");
}

export function getActivitySummaryChips(
  activity: GeneratedReportActivity
): string[] {
  const totalWorkers =
    activity.manpower && activity.manpower.totalWorkers !== null
      ? `${activity.manpower.totalWorkers} workers`
      : null;

  return [toTitleCase(activity.status), activity.location, totalWorkers].filter(
    Boolean
  ) as string[];
}

export function getReportCompleteness(report: GeneratedSiteReport): number {
  const checks = [
    report.report.meta.title !== "",
    report.report.meta.summary !== "",
    report.report.meta.visitDate !== null,
    report.report.weather !== null,
    report.report.manpower !== null,
    report.report.activities.length > 0,
    report.report.siteConditions.length > 0,
    report.report.nextSteps.length > 0,
  ];

  const filled = checks.filter(Boolean).length;
  return Math.round((filled / checks.length) * 100);
}
