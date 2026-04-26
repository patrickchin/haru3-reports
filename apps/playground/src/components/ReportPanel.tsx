import type { GeneratedSiteReport } from "../lib/generated-report";
import { formatDate } from "../lib/report-helpers";
import { StatBar } from "./cards/StatBar";
import { WeatherCard } from "./cards/WeatherCard";
import { WorkersCard } from "./cards/WorkersCard";
import { MaterialsCard } from "./cards/MaterialsCard";
import { IssuesCard } from "./cards/IssuesCard";
import { NextStepsCard } from "./cards/NextStepsCard";
import { SectionsCard } from "./cards/SectionsCard";

interface ReportPanelProps {
  report: GeneratedSiteReport;
}

export function ReportPanel({ report }: ReportPanelProps) {
  const { meta } = report.report;

  return (
    <div className="report-content">
      {/* Meta */}
      <div className="report-meta">
        <h2 className="report-title">{meta.title || "Untitled Report"}</h2>
        <div className="report-meta-chips">
          <span className="chip">{meta.reportType}</span>
          {meta.visitDate && <span className="chip">{formatDate(meta.visitDate)}</span>}
        </div>
      </div>

      {/* Stats bar */}
      <StatBar report={report} />

      {/* Weather */}
      <WeatherCard report={report} />

      {/* Summary */}
      {meta.summary && (
        <div className="card">
          <div className="section-header">
            <h3 className="section-title">Summary</h3>
          </div>
          <p className="section-content">{meta.summary}</p>
        </div>
      )}

      {/* Issues (high priority) */}
      <IssuesCard issues={report.report.issues} />

      {/* Workers */}
      <WorkersCard workers={report.report.workers} />

      {/* Materials */}
      <MaterialsCard materials={report.report.materials} />

      {/* Next steps */}
      <NextStepsCard steps={report.report.nextSteps} />

      {/* Sections */}
      <SectionsCard sections={report.report.sections} />
    </div>
  );
}
