/**
 * Convert GeneratedSiteReport to HTML for PDF export.
 * Ported from mobile v1.
 */
import type { GeneratedSiteReport } from "@harpa/report-core";

export interface PdfBranding {
  companyName?: string;
  logoUrl?: string;
}

function esc(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function toTitleCase(value: string): string {
  return value
    .replace(/[_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function createCounter() {
  let major = 0;
  return {
    next(): string {
      major++;
      return `${major}`;
    },
  };
}

export function reportToHtml(
  report: GeneratedSiteReport,
  branding: PdfBranding = {}
): string {
  const { companyName } = branding;
  const { meta, weather, workers, materials, issues, nextSteps, sections } =
    report.report;
  const counter = createCounter();

  const headerHtml = `
    <header>
      ${companyName ? `<p class="company">${esc(companyName)}</p>` : ""}
      <h1>${esc(meta.title)}</h1>
      <table class="title-meta">
        <tbody>
          <tr><td class="label">Report Type</td><td>${toTitleCase(meta.reportType)}</td></tr>
          ${meta.visitDate ? `<tr><td class="label">Date</td><td>${formatDate(meta.visitDate)}</td></tr>` : ""}
        </tbody>
      </table>
    </header>`;

  const summaryNum = counter.next();
  const summaryHtml = meta.summary
    ? `<div class="section"><h2>${summaryNum}. Summary</h2><p>${esc(meta.summary)}</p></div>`
    : "";

  let weatherHtml = "";
  if (weather) {
    const weatherNum = counter.next();
    const weatherRows = [
      weather.conditions ? `<tr><td>Conditions</td><td>${esc(weather.conditions)}</td></tr>` : "",
      weather.temperature ? `<tr><td>Temperature</td><td>${esc(weather.temperature)}</td></tr>` : "",
      weather.wind ? `<tr><td>Wind</td><td>${esc(weather.wind)}</td></tr>` : "",
      weather.impact ? `<tr><td>Impact</td><td>${esc(weather.impact)}</td></tr>` : "",
    ].filter(Boolean).join("");
    weatherHtml = `<div class="section"><h2>${weatherNum}. Weather</h2><table><tbody>${weatherRows}</tbody></table></div>`;
  }

  let workersHtml = "";
  if (workers) {
    const workersNum = counter.next();
    const rolesRows = workers.roles
      .map((r) => `<tr><td>${esc(r.role)}</td><td>${r.count ?? "—"}</td><td>${esc(r.notes ?? "")}</td></tr>`)
      .join("");
    workersHtml = `
      <div class="section">
        <h2>${workersNum}. Personnel</h2>
        ${workers.totalWorkers !== null ? `<p><strong>Total:</strong> ${workers.totalWorkers}</p>` : ""}
        ${rolesRows ? `<table><thead><tr><th>Role</th><th>Count</th><th>Notes</th></tr></thead><tbody>${rolesRows}</tbody></table>` : ""}
      </div>`;
  }

  let materialsHtml = "";
  if (materials.length > 0) {
    const materialsNum = counter.next();
    const rows = materials
      .map((m) => {
        const qty = [m.quantity, m.quantityUnit].filter(Boolean).join(" ") || "—";
        return `<tr><td>${esc(m.name)}</td><td>${esc(qty)}</td><td>${esc(m.status ? toTitleCase(m.status) : "—")}</td></tr>`;
      })
      .join("");
    materialsHtml = `<div class="section"><h2>${materialsNum}. Materials</h2><table><thead><tr><th>Name</th><th>Quantity</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  let issuesHtml = "";
  if (issues.length > 0) {
    const issuesNum = counter.next();
    const rows = issues
      .map((issue) => `<tr><td>${esc(issue.title)}</td><td>${toTitleCase(issue.severity)}</td><td>${esc(issue.details)}</td></tr>`)
      .join("");
    issuesHtml = `<div class="section"><h2>${issuesNum}. Issues</h2><table><thead><tr><th>Title</th><th>Severity</th><th>Details</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  let stepsHtml = "";
  if (nextSteps.length > 0) {
    const stepsNum = counter.next();
    const items = nextSteps.map((s, i) => `<tr><td>${i + 1}.</td><td>${esc(s)}</td></tr>`).join("");
    stepsHtml = `<div class="section"><h2>${stepsNum}. Next Steps</h2><table><tbody>${items}</tbody></table></div>`;
  }

  const sectionsHtml = sections
    .map((s) => {
      const num = counter.next();
      return `<div class="section"><h2>${num}. ${esc(s.title)}</h2><p>${esc(s.content)}</p></div>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${esc(meta.title)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Georgia, serif; font-size: 10pt; line-height: 1.4; color: #111; background: #fff; padding: 18mm 22mm; }
    header { margin-bottom: 16pt; padding-bottom: 10pt; border-bottom: 1.5pt solid #111; }
    .company { font-size: 8pt; text-transform: uppercase; letter-spacing: 2pt; color: #555; margin-bottom: 4pt; }
    h1 { font-size: 22pt; font-weight: 700; margin-bottom: 6pt; }
    .title-meta { margin-top: 6pt; font-size: 9pt; }
    .title-meta td { padding: 2pt 8pt 2pt 0; }
    .title-meta .label { font-weight: 600; color: #555; }
    .section { margin-top: 14pt; }
    h2 { font-size: 12pt; font-weight: 600; margin-bottom: 6pt; }
    p { margin-bottom: 6pt; }
    table { width: 100%; border-collapse: collapse; margin-top: 6pt; }
    th, td { text-align: left; padding: 4pt 6pt; border-bottom: 0.5pt solid #ddd; }
    th { font-weight: 600; background: #f5f5f5; }
  </style>
</head>
<body>
  ${headerHtml}
  ${summaryHtml}
  ${weatherHtml}
  ${workersHtml}
  ${materialsHtml}
  ${issuesHtml}
  ${stepsHtml}
  ${sectionsHtml}
</body>
</html>`;
}
