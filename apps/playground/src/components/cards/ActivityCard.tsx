import type { GeneratedReportActivity } from "../../lib/generated-report";
import {
  toTitleCase,
  getActivitySummaryChips,
  getManpowerLines,
  getItemMeta,
  formatSourceNotes,
  getIssueSeverityTone,
} from "../../lib/report-helpers";

const STATUS_LABEL: Record<string, string> = {
  completed: "COMPLETED",
  "in-progress": "IN PROGRESS",
  in_progress: "IN PROGRESS",
  blocked: "BLOCKED",
  delayed: "DELAYED",
};

interface ActivityCardProps {
  activity: GeneratedReportActivity;
}

export function ActivityCard({ activity }: ActivityCardProps) {
  const chips = getActivitySummaryChips(activity);
  const crewLines = getManpowerLines(activity.manpower);
  const statusLabel =
    STATUS_LABEL[activity.status.toLowerCase()] ??
    activity.status.toUpperCase();
  const sourceNotes = formatSourceNotes(activity.sourceNoteIndexes);

  return (
    <div className="card activity-card">
      <div className="activity-header">
        <span className="activity-status-badge">[{statusLabel}]</span>
        <h4 className="activity-name">{activity.name}</h4>
        {chips.length > 0 && (
          <div className="activity-chips">
            {chips.map((chip) => (
              <span key={chip} className="chip">
                {chip}
              </span>
            ))}
          </div>
        )}
      </div>

      <p className="activity-summary">{activity.summary}</p>

      {crewLines.length > 0 && (
        <div className="activity-section">
          <span className="activity-section-label">Crew</span>
          {crewLines.map((line, i) => (
            <p key={i} className="card-muted">
              {line}
            </p>
          ))}
        </div>
      )}

      {activity.materials.length > 0 && (
        <div className="activity-section">
          <span className="activity-section-label">Materials</span>
          {activity.materials.map((item, i) => {
            const meta = getItemMeta([
              item.quantity,
              item.status ? toTitleCase(item.status) : null,
              item.notes,
            ]);
            return (
              <div key={`mat-${item.name}-${i}`} className="sub-item">
                <span className="sub-item-name">{item.name}</span>
                {meta && <span className="sub-item-meta">{meta}</span>}
              </div>
            );
          })}
        </div>
      )}

      {activity.equipment.length > 0 && (
        <div className="activity-section">
          <span className="activity-section-label">Equipment</span>
          {activity.equipment.map((item, i) => {
            const meta = getItemMeta([
              item.quantity,
              item.status ? toTitleCase(item.status) : null,
              item.hoursUsed ? `Hours: ${item.hoursUsed}` : null,
              item.notes,
            ]);
            return (
              <div key={`eq-${item.name}-${i}`} className="sub-item">
                <span className="sub-item-name">{item.name}</span>
                {meta && <span className="sub-item-meta">{meta}</span>}
              </div>
            );
          })}
        </div>
      )}

      {activity.issues.length > 0 && (
        <div className="activity-section">
          <span className="activity-section-label">Issues</span>
          {activity.issues.map((issue, i) => {
            const tone = getIssueSeverityTone(issue.severity);
            return (
              <div
                key={`iss-${issue.title}-${i}`}
                className={`issue-row issue-${tone}`}
              >
                <span className={`issue-severity issue-severity-${tone}`}>
                  {toTitleCase(issue.severity)}
                </span>
                <span className="issue-title">{issue.title}</span>
                <p className="card-muted">{issue.details}</p>
                {issue.actionRequired && (
                  <p className="card-muted">
                    <strong>Action:</strong> {issue.actionRequired}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {activity.observations.length > 0 && (
        <div className="activity-section">
          <span className="activity-section-label">Observations</span>
          {activity.observations.map((obs, i) => (
            <p key={i} className="card-muted">
              • {obs}
            </p>
          ))}
        </div>
      )}

      {sourceNotes && <p className="source-notes">{sourceNotes}</p>}
    </div>
  );
}
