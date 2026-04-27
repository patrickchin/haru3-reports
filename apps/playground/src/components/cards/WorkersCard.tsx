import type { GeneratedReportWorkers } from "../../lib/generated-report";
import { workersToText } from "../../lib/report-to-text";
import { CopyButton } from "../CopyButton";

interface WorkersCardProps {
  workers: GeneratedReportWorkers | null;
}

export function WorkersCard({ workers }: WorkersCardProps) {
  if (!workers) return null;

  const hasRoles = workers.roles.length > 0;
  const maxCount = Math.max(...workers.roles.map((r) => r.count ?? 0), 1);

  return (
    <div className="card">
      <div className="section-header">
        <h3 className="section-title">Workers</h3>
        <span className="section-subtitle">
          {workers.totalWorkers !== null
            ? `${workers.totalWorkers} on site`
            : "Crew breakdown recorded"}
        </span>
        <CopyButton
          label="Copy workers breakdown"
          getValue={() => workersToText(workers)}
        />
      </div>

      {hasRoles && (
        <div className="manpower-roles">
          {workers.roles.map((role, i) => {
            const count = role.count ?? 0;
            const pct = Math.round((count / maxCount) * 100);
            return (
              <div key={`${role.role}-${i}`} className="manpower-role">
                <div className="manpower-role-header">
                  <span>{role.role}</span>
                  <span className="manpower-role-count">{count}</span>
                </div>
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {workers.workerHours && (
        <p className="card-muted">Hours: {workers.workerHours}</p>
      )}
      {workers.notes && <p className="card-muted">{workers.notes}</p>}
    </div>
  );
}
