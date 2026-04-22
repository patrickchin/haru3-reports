import type { GeneratedReportManpower } from "../../lib/generated-report";

interface ManpowerCardProps {
  manpower: GeneratedReportManpower | null;
}

export function ManpowerCard({ manpower }: ManpowerCardProps) {
  if (!manpower) return null;

  const hasRoles = manpower.roles.length > 0;
  const maxCount = Math.max(...manpower.roles.map((r) => r.count ?? 0), 1);

  return (
    <div className="card">
      <div className="section-header">
        <h3 className="section-title">Manpower</h3>
        <span className="section-subtitle">
          {manpower.totalWorkers !== null
            ? `${manpower.totalWorkers} on site`
            : "Crew breakdown recorded"}
        </span>
      </div>

      {hasRoles && (
        <div className="manpower-roles">
          {manpower.roles.map((role, i) => {
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

      {manpower.workerHours && (
        <p className="card-muted">Hours: {manpower.workerHours}</p>
      )}
      {manpower.notes && <p className="card-muted">{manpower.notes}</p>}
    </div>
  );
}
