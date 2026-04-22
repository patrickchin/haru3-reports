import type { GeneratedReportSiteCondition } from "../../lib/generated-report";

interface SiteConditionsCardProps {
  conditions: readonly GeneratedReportSiteCondition[];
}

export function SiteConditionsCard({ conditions }: SiteConditionsCardProps) {
  if (conditions.length === 0) return null;

  return (
    <div className="card">
      <div className="section-header">
        <h3 className="section-title">Site Conditions</h3>
        <span className="section-subtitle">
          {conditions.length} condition{conditions.length !== 1 ? "s" : ""} noted
        </span>
      </div>

      <div className="conditions-list">
        {conditions.map((c, i) => (
          <div key={`${c.topic}-${i}`} className="condition-item">
            <span className="condition-topic">{c.topic}</span>
            <p className="condition-details">{c.details}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
