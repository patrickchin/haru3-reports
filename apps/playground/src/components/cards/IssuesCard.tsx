import type { GeneratedReportIssue } from "../../lib/generated-report";
import {
  toTitleCase,
  getIssueMeta,
  formatSourceNotes,
  getIssueSeverityTone,
} from "../../lib/report-helpers";

interface IssuesCardProps {
  issues: readonly GeneratedReportIssue[];
}

export function IssuesCard({ issues }: IssuesCardProps) {
  if (issues.length === 0) return null;

  return (
    <div className="card">
      <div className="section-header">
        <h3 className="section-title">Issues</h3>
        <span className="issues-count-badge">{issues.length}</span>
      </div>

      <div className="issues-list">
        {issues.map((issue, i) => {
          const tone = getIssueSeverityTone(issue.severity);
          const meta = getIssueMeta(issue);
          const sourceNotes = formatSourceNotes(issue.sourceNoteIndexes);

          return (
            <div
              key={`${issue.title}-${i}`}
              className={`issue-row issue-${tone}`}
            >
              <div className="issue-header">
                <span className="issue-title">{issue.title}</span>
                <span className={`issue-severity issue-severity-${tone}`}>
                  {toTitleCase(issue.severity)}
                </span>
              </div>
              <p className="card-muted">{issue.details}</p>
              {issue.actionRequired && (
                <p className="card-muted">
                  <strong>Action:</strong> {issue.actionRequired}
                </p>
              )}
              {meta && <p className="issue-meta">{meta}</p>}
              {sourceNotes && <p className="source-notes">{sourceNotes}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
