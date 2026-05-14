import type {
  GeneratedReportIssue,
  GeneratedReportMaterial,
  GeneratedReportSection,
  GeneratedReportWorkers,
  GeneratedSiteReport,
} from "./generated-report";
import { toTitleCase, formatDate } from "./report-helpers";

const NL = "\n";

function joinNonEmpty(
  parts: Array<string | number | null | undefined>,
  sep = " · ",
) {
  return parts
    .map((p) => (p == null ? "" : String(p)))
    .filter((p) => p.trim().length > 0)
    .join(sep);
}

export function summaryToText(report: GeneratedSiteReport): string {
  return report.report.meta.summary?.trim() ?? "";
}

export function issueToText(issue: GeneratedReportIssue): string {
  const lines: string[] = [];
  lines.push(`${issue.title} [${toTitleCase(issue.severity)}]`);
  const meta = joinNonEmpty([
    issue.category ? toTitleCase(issue.category) : null,
    issue.status ? toTitleCase(issue.status) : null,
  ]);
  if (meta) lines.push(meta);
  if (issue.details) lines.push(issue.details);
  if (issue.actionRequired) lines.push(`Action: ${issue.actionRequired}`);
  return lines.join(NL);
}

export function issuesToText(issues: readonly GeneratedReportIssue[]): string {
  if (issues.length === 0) return "";
  return issues
    .map((issue, i) => `${i + 1}. ${issueToText(issue).replace(/\n/g, "\n   ")}`)
    .join(NL + NL);
}

export function nextStepsToText(steps: readonly string[]): string {
  if (steps.length === 0) return "";
  return steps.map((step, i) => `${i + 1}. ${step}`).join(NL);
}

export function sectionToText(section: GeneratedReportSection): string {
  const heading = section.title;
  const body = section.content?.trim() ?? "";
  return `## ${heading}${NL}${NL}${body}`;
}

export function sectionsToText(
  sections: readonly GeneratedReportSection[],
): string {
  return sections.map(sectionToText).join(NL + NL);
}

export function materialsToText(
  materials: readonly GeneratedReportMaterial[],
): string {
  if (materials.length === 0) return "";
  return materials
    .map((m) => {
      const qty = joinNonEmpty([m.quantity ?? null, m.quantityUnit ?? null], " ");
      const meta = joinNonEmpty([
        qty || null,
        m.status ? toTitleCase(m.status) : null,
        m.condition ? toTitleCase(m.condition) : null,
      ]);
      const head = meta ? `- ${m.name} (${meta})` : `- ${m.name}`;
      return m.notes ? `${head}\n  ${m.notes}` : head;
    })
    .join(NL);
}

export function workersToText(workers: GeneratedReportWorkers | null): string {
  if (!workers) return "";
  const lines: string[] = [];
  if (workers.totalWorkers !== null && workers.totalWorkers !== undefined) {
    lines.push(`Total on site: ${workers.totalWorkers}`);
  }
  if (workers.roles.length > 0) {
    workers.roles.forEach((r) => {
      lines.push(`- ${r.role}: ${r.count ?? 0}`);
    });
  }
  if (workers.workerHours) lines.push(`Hours: ${workers.workerHours}`);
  if (workers.notes) lines.push(workers.notes);
  return lines.join(NL);
}

export function weatherToText(report: GeneratedSiteReport): string {
  const w = report.report.weather;
  if (!w) return "";
  const parts = joinNonEmpty([w.conditions ?? null, w.temperature ?? null, w.wind ?? null]);
  const lines: string[] = [];
  if (parts) lines.push(parts);
  if (w.impact) lines.push(`Impact: ${w.impact}`);
  return lines.join(NL);
}

export function reportToMarkdown(report: GeneratedSiteReport): string {
  const { meta, workers, materials, issues, nextSteps, sections } =
    report.report;
  const blocks: string[] = [];

  // Header
  const titleLine = `# ${meta.title?.trim() || "Untitled Report"}`;
  const metaLine = joinNonEmpty([
    meta.reportType ? toTitleCase(meta.reportType) : null,
    meta.visitDate ? formatDate(meta.visitDate) : null,
  ]);
  blocks.push(metaLine ? `${titleLine}${NL}${metaLine}` : titleLine);

  if (meta.summary?.trim()) {
    blocks.push(`## Summary${NL}${NL}${meta.summary.trim()}`);
  }

  const w = weatherToText(report);
  if (w) blocks.push(`## Weather${NL}${NL}${w}`);

  const wk = workersToText(workers);
  if (wk) blocks.push(`## Workers${NL}${NL}${wk}`);

  const mt = materialsToText(materials);
  if (mt) blocks.push(`## Materials${NL}${NL}${mt}`);

  const iss = issuesToText(issues);
  if (iss) blocks.push(`## Issues${NL}${NL}${iss}`);

  const ns = nextStepsToText(nextSteps);
  if (ns) blocks.push(`## Next Steps${NL}${NL}${ns}`);

  if (sections.length > 0) {
    blocks.push(sectionsToText(sections));
  }

  return blocks.join(NL + NL) + NL;
}
