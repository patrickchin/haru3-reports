import type {
  GeneratedSiteReport,
  GeneratedReportActivity,
  GeneratedReportIssue,
  GeneratedReportManpower,
  GeneratedReportMaterial,
  GeneratedReportEquipment,
  GeneratedReportSiteCondition,
} from "./generated-report";

export interface PdfBranding {
  companyName?: string;
  logoUrl?: string;
  accentColor?: string;
}

// ── Helpers ────────────────────────────────────────────────────

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

// ── Section numbering ──────────────────────────────────────────

function createCounter() {
  let major = 0;
  let minor = 0;
  return {
    next(): string { major++; minor = 0; return `${major}`; },
    sub(): string { minor++; return `${major}.${minor}`; },
  };
}

// ── Render helpers ─────────────────────────────────────────────

function renderManpower(
  manpower: GeneratedReportManpower | null,
  heading: string | null
): string {
  if (!manpower) return "";
  const rows = manpower.roles
    .map(
      (r) =>
        `<tr><td>${esc(r.role)}</td><td class="num">${r.count ?? "\u2014"}</td><td>${esc(r.notes ?? "")}</td></tr>`
    )
    .join("");

  return `
    <div class="section">
      ${heading ? `<h2>${heading}</h2>` : ""}
      ${manpower.totalWorkers !== null ? `<p><strong>Total personnel on site:</strong> ${manpower.totalWorkers}</p>` : ""}
      ${manpower.workerHours ? `<p><strong>Worker hours:</strong> ${esc(manpower.workerHours)}</p>` : ""}
      ${manpower.notes ? `<p>${esc(manpower.notes)}</p>` : ""}
      ${
        rows
          ? `<table><thead><tr><th>Role</th><th class="num">Count</th><th>Notes</th></tr></thead><tbody>${rows}</tbody></table>`
          : ""
      }
    </div>`;
}

function renderIssueTable(
  issues: readonly GeneratedReportIssue[],
  heading: string | null
): string {
  if (issues.length === 0) return "";
  const rows = issues
    .map(
      (issue) => `
        <tr>
          <td>${esc(issue.title)}</td>
          <td>${toTitleCase(issue.category)}</td>
          <td class="severity-${issue.severity.toLowerCase()}">${toTitleCase(issue.severity)}</td>
          <td>${toTitleCase(issue.status)}</td>
        </tr>
        <tr class="detail-row">
          <td colspan="4">
            ${esc(issue.details)}
            ${issue.actionRequired ? `<br/><strong>Action Required:</strong> ${esc(issue.actionRequired)}` : ""}
          </td>
        </tr>`
    )
    .join("");

  return `
    <div class="section">
      ${heading ? `<h2>${heading}</h2>` : ""}
      <table>
        <thead><tr><th>Issue</th><th>Category</th><th>Severity</th><th>Status</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function renderMaterials(materials: readonly GeneratedReportMaterial[]): string {
  if (materials.length === 0) return "";
  const rows = materials
    .map(
      (m) =>
        `<tr><td>${esc(m.name)}</td><td>${esc(m.quantity ?? "\u2014")}</td><td>${esc(m.status ? toTitleCase(m.status) : "\u2014")}</td><td>${esc(m.notes ?? "")}</td></tr>`
    )
    .join("");
  return `
    <p class="sub-heading">Materials</p>
    <table><thead><tr><th>Name</th><th>Quantity</th><th>Status</th><th>Notes</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderEquipment(equipment: readonly GeneratedReportEquipment[]): string {
  if (equipment.length === 0) return "";
  const rows = equipment
    .map(
      (e) =>
        `<tr><td>${esc(e.name)}</td><td>${esc(e.quantity ?? "\u2014")}</td><td>${esc(e.status ? toTitleCase(e.status) : "\u2014")}</td><td>${esc(e.hoursUsed ?? "\u2014")}</td><td>${esc(e.notes ?? "")}</td></tr>`
    )
    .join("");
  return `
    <p class="sub-heading">Equipment</p>
    <table><thead><tr><th>Name</th><th>Qty</th><th>Status</th><th>Hours Used</th><th>Notes</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderActivity(
  activity: GeneratedReportActivity,
  sectionNum: string
): string {
  const statusLabel = toTitleCase(activity.status);
  return `
    <div class="activity">
      <h3>${sectionNum} &mdash; ${esc(activity.name)}</h3>
      <table class="meta-table">
        <tbody>
          <tr><td class="label">Status</td><td>${esc(statusLabel)}</td></tr>
          ${activity.location ? `<tr><td class="label">Location</td><td>${esc(activity.location)}</td></tr>` : ""}
        </tbody>
      </table>
      <p>${esc(activity.summary)}</p>
      ${renderManpower(activity.manpower, null)}
      ${renderMaterials(activity.materials)}
      ${renderEquipment(activity.equipment)}
      ${
        activity.observations.length > 0
          ? `<p class="sub-heading">Observations</p><ul>${activity.observations.map((o) => `<li>${esc(o)}</li>`).join("")}</ul>`
          : ""
      }
      ${activity.issues.length > 0 ? renderIssueTable(activity.issues, null) : ""}
    </div>`;
}

function renderSiteConditions(
  conditions: readonly GeneratedReportSiteCondition[],
  heading: string
): string {
  if (conditions.length === 0) return "";
  const rows = conditions
    .map(
      (c) =>
        `<tr><td class="label">${esc(c.topic)}</td><td>${esc(c.details)}</td></tr>`
    )
    .join("");
  return `
    <div class="section">
      <h2>${heading}</h2>
      <table><thead><tr><th>Area / Topic</th><th>Details</th></tr></thead><tbody>${rows}</tbody></table>
    </div>`;
}

function renderNextSteps(steps: readonly string[], heading: string): string {
  if (steps.length === 0) return "";
  const items = steps
    .map((s, i) => `<tr><td class="num">${i + 1}.</td><td>${esc(s)}</td></tr>`)
    .join("");
  return `
    <div class="section">
      <h2>${heading}</h2>
      <table><tbody>${items}</tbody></table>
    </div>`;
}

function renderSections(
  sections: GeneratedSiteReport["report"]["sections"],
  counter: ReturnType<typeof createCounter>
): string {
  if (sections.length === 0) return "";
  return sections
    .map(
      (s) => `
      <div class="section">
        <h2>${counter.next()}. ${esc(s.title)}</h2>
        <p>${esc(s.content)}</p>
      </div>`
    )
    .join("");
}

// ── Main export ────────────────────────────────────────────────

export function reportToHtml(
  report: GeneratedSiteReport,
  branding: PdfBranding = {}
): string {
  const { companyName, logoUrl } = branding;
  const { meta, weather, manpower, siteConditions, activities, issues, nextSteps, sections } =
    report.report;
  const counter = createCounter();

  // ── Title page / header ──────────────────────────────────────

  const headerHtml = `
    <header>
      ${logoUrl ? `<img src="${esc(logoUrl)}" class="logo" alt="" />` : ""}
      ${companyName ? `<p class="company">${esc(companyName)}</p>` : ""}
      <h1>${esc(meta.title)}</h1>
      <table class="title-meta">
        <tbody>
          <tr><td class="label">Report Type</td><td>${toTitleCase(meta.reportType)}</td></tr>
          ${meta.visitDate ? `<tr><td class="label">Date of Visit</td><td>${formatDate(meta.visitDate)}</td></tr>` : ""}
          ${companyName ? `<tr><td class="label">Prepared By</td><td>${esc(companyName)}</td></tr>` : ""}
        </tbody>
      </table>
    </header>`;

  // ── Executive Summary ────────────────────────────────────────

  const summaryNum = counter.next();
  const summaryHtml = meta.summary
    ? `<div class="section"><h2>${summaryNum}. Executive Summary</h2><p>${esc(meta.summary)}</p></div>`
    : "";

  // ── Key Figures + Weather (side by side) ─────────────────────

  const figuresNum = counter.next();
  const figuresCol = `
    <div class="section">
      <h2>${figuresNum}. Key Figures</h2>
      <table>
        <thead><tr><th>Metric</th><th class="num">Value</th></tr></thead>
        <tbody>
          <tr><td>Personnel on Site</td><td class="num">${manpower?.totalWorkers ?? 0}</td></tr>
          <tr><td>Work Activities</td><td class="num">${activities.length}</td></tr>
          <tr><td>Issues Recorded</td><td class="num">${issues.length}</td></tr>
        </tbody>
      </table>
    </div>`;

  let weatherCol = "";
  if (weather) {
    const weatherNum = counter.next();
    const weatherRows = [
      weather.conditions ? ["Conditions", weather.conditions] : null,
      weather.temperature ? ["Temperature", weather.temperature] : null,
      weather.wind ? ["Wind", weather.wind] : null,
      weather.impact ? ["Impact on Works", weather.impact] : null,
    ]
      .filter(Boolean)
      .map((r) => `<tr><td class="label">${esc(r![0])}</td><td>${esc(r![1])}</td></tr>`)
      .join("");
    weatherCol = `
      <div class="section">
        <h2>${weatherNum}. Weather Conditions</h2>
        <table><tbody>${weatherRows}</tbody></table>
      </div>`;
  }

  const figuresWeatherHtml = weatherCol
    ? `<div class="two-col">${figuresCol}${weatherCol}</div>`
    : figuresCol;

  // ── Issues ───────────────────────────────────────────────────

  const issuesNum = issues.length > 0 ? counter.next() : "";
  const issuesHtml = renderIssueTable(issues, issuesNum ? `${issuesNum}. Issues and Incidents` : null);

  // ── Activities ───────────────────────────────────────────────

  let activitiesHtml = "";
  if (activities.length > 0) {
    const actNum = counter.next();
    const activityCards = activities
      .map((a, i) => renderActivity(a, `${actNum}.${i + 1}`))
      .join("");
    activitiesHtml = `
      <div class="section page-break-before">
        <h2>${actNum}. Work Activities</h2>
        ${activityCards}
      </div>`;
  }

  // ── Top-level Manpower ───────────────────────────────────────

  const manpowerNum = manpower ? counter.next() : "";
  const manpowerHtml = renderManpower(manpower, manpowerNum ? `${manpowerNum}. Personnel Summary` : null);

  // ── Site Conditions ──────────────────────────────────────────

  const condNum = siteConditions.length > 0 ? counter.next() : "";
  const conditionsHtml = renderSiteConditions(siteConditions, condNum ? `${condNum}. Site Conditions` : "");

  // ── Next Steps ───────────────────────────────────────────────

  const stepsNum = nextSteps.length > 0 ? counter.next() : "";
  const stepsHtml = renderNextSteps(nextSteps, stepsNum ? `${stepsNum}. Recommended Actions` : "");

  // ── Additional Sections ──────────────────────────────────────

  const sectionsHtml = renderSections(sections, counter);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(meta.title)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: 'Georgia', 'Times New Roman', 'Times', serif;
      font-size: 10pt;
      line-height: 1.4;
      color: #111;
      background: #f5f5f5;
    }

    .page {
      max-width: 210mm;
      margin: 0 auto;
      padding: 18mm 22mm;
      background: white;
    }

    /* ── Header / title block ─────────────────────────────── */

    header {
      text-align: left;
      margin-bottom: 16pt;
      padding-bottom: 10pt;
      border-bottom: 1.5pt solid #111;
    }

    .logo { height: 32pt; margin-bottom: 6pt; }

    .company {
      font-size: 8pt;
      text-transform: uppercase;
      letter-spacing: 3pt;
      color: #555;
      margin-bottom: 4pt;
    }

    h1 {
      font-size: 15pt;
      font-weight: 700;
      margin-bottom: 8pt;
      line-height: 1.25;
    }

    .title-meta {
      font-size: 9pt;
      border: none;
    }
    .title-meta td {
      padding: 1pt 8pt 1pt 0;
      border: none;
    }

    /* ── Section headings ─────────────────────────────────── */

    h2 {
      font-size: 11pt;
      font-weight: 700;
      margin: 18pt 0 6pt;
      padding-bottom: 3pt;
      border-bottom: 1.5pt solid #111;
      page-break-after: avoid;
    }

    h3 {
      font-size: 10pt;
      font-weight: 700;
      margin: 10pt 0 3pt;
      page-break-after: avoid;
    }

    .sub-heading {
      font-size: 9pt;
      font-weight: 700;
      font-style: italic;
      margin: 8pt 0 2pt;
    }

    /* ── Body text ────────────────────────────────────────── */

    p { margin: 3pt 0; text-align: justify; }
    ul { margin: 2pt 0 2pt 16pt; }
    li { margin-bottom: 1pt; }

    /* ── Tables ───────────────────────────────────────────── */

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 9pt;
      margin: 4pt 0;
    }

    th {
      text-align: left;
      font-weight: 700;
      font-size: 8pt;
      text-transform: uppercase;
      letter-spacing: 0.5pt;
      border-top: 0.75pt solid #999;
      border-bottom: 0.75pt solid #999;
      padding: 3pt 5pt;
    }

    td {
      padding: 2.5pt 5pt;
      border-bottom: 0.5pt solid #ccc;
      vertical-align: top;
    }

    td.num, th.num { text-align: right; }

    td.label {
      font-weight: 700;
      white-space: nowrap;
      width: 1%;
    }

    .detail-row td {
      font-size: 8.5pt;
      color: #333;
      padding: 2pt 5pt 5pt;
      border-bottom: 0.75pt solid #999;
    }

    .meta-table { border: none; margin: 2pt 0 4pt; }
    .meta-table td { border: none; padding: 0pt 6pt 0pt 0; font-size: 9pt; }

    /* ── Severity indicators (text only) ──────────────────── */

    .severity-high { font-weight: 700; }
    .severity-medium { font-weight: 600; }
    .severity-low { color: #555; }

    /* ── Activity blocks ──────────────────────────────────── */

    .activity {
      margin-bottom: 10pt;
      padding-bottom: 6pt;
      border-bottom: 0.5pt solid #ddd;
      page-break-inside: avoid;
    }
    .activity:last-child { border-bottom: none; }

    .section { margin-bottom: 2pt; }

    /* ── Side-by-side layout ────────────────────────────────── */

    .two-col { display: flex; gap: 16pt; align-items: flex-start; }
    .two-col > .section { flex: 1; min-width: 0; }

    /* ── Footer ───────────────────────────────────────────── */

    footer {
      margin-top: 20pt;
      padding-top: 8pt;
      border-top: 0.75pt solid #999;
      font-size: 8pt;
      color: #777;
      text-align: center;
    }

    /* ── Print ────────────────────────────────────────────── */

    @media print {
      body { background: white; }
      .page { max-width: none; padding: 15mm 18mm; margin: 0; }
      .page-break-before { page-break-before: always; }
    }
  </style>
</head>
<body>
  <div class="page">
    ${headerHtml}
    ${summaryHtml}
    ${figuresWeatherHtml}
    ${issuesHtml}
    ${activitiesHtml}
    ${manpowerHtml}
    ${conditionsHtml}
    ${stepsHtml}
    ${sectionsHtml}
    <footer>
      This report was generated on ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}.
      ${companyName ? `Prepared by ${esc(companyName)}.` : ""}
      Page 1 of 1.
    </footer>
  </div>
</body>
</html>`;
}
