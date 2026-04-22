import type { GeneratedSiteReport } from "../../lib/generated-report";
import { getReportStats } from "../../lib/report-helpers";

interface StatBarProps {
  report: GeneratedSiteReport;
}

export function StatBar({ report }: StatBarProps) {
  const stats = getReportStats(report);

  return (
    <div className="stat-bar">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className={`stat-tile ${stat.tone === "warning" ? "stat-tile-warning" : ""}`}
        >
          <span className="stat-value">{stat.value}</span>
          <span className="stat-label">{stat.label}</span>
        </div>
      ))}
    </div>
  );
}
