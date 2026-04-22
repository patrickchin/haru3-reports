import type { GeneratedSiteReport } from "../lib/generated-report";
import { formatDate } from "../lib/report-helpers";
import { StatBar } from "./cards/StatBar";
import { WeatherCard } from "./cards/WeatherCard";
import { ManpowerCard } from "./cards/ManpowerCard";
import { SiteConditionsCard } from "./cards/SiteConditionsCard";
import { ActivityCard } from "./cards/ActivityCard";
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

      {/* Activities */}
      {report.report.activities.length > 0 && (
        <>
          <span className="group-label">Work Progress</span>
          {report.report.activities.map((activity, i) => (
            <ActivityCard key={`${activity.name}-${i}`} activity={activity} />
          ))}
        </>
      )}

      {/* Manpower */}
      <ManpowerCard manpower={report.report.manpower} />

      {/* Site conditions */}
      <SiteConditionsCard conditions={report.report.siteConditions} />

      {/* Next steps */}
      <NextStepsCard steps={report.report.nextSteps} />

      {/* Sections */}
      <SectionsCard sections={report.report.sections} />
    </div>
  );
}
