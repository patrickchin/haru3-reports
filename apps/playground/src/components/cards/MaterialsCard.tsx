import type { GeneratedReportMaterial } from "../../lib/generated-report";
import { toTitleCase, getItemMeta } from "../../lib/report-helpers";

interface MaterialsCardProps {
  materials: readonly GeneratedReportMaterial[];
}

export function MaterialsCard({ materials }: MaterialsCardProps) {
  if (materials.length === 0) return null;

  return (
    <div className="card">
      <div className="section-header">
        <h3 className="section-title">Materials</h3>
        <span className="section-subtitle">
          {materials.length} {materials.length === 1 ? "item" : "items"}
        </span>
      </div>
      {materials.map((material, i) => {
        const qty = [material.quantity, material.quantityUnit]
          .filter(Boolean)
          .join(" ");
        const meta = getItemMeta([
          qty || null,
          material.status ? toTitleCase(material.status) : null,
          material.condition ? toTitleCase(material.condition) : null,
        ]);
        return (
          <div key={`mat-${material.name}-${i}`} className="sub-item">
            <span className="sub-item-name">{material.name}</span>
            {meta && <span className="sub-item-meta">{meta}</span>}
            {material.notes && <p className="card-muted">{material.notes}</p>}
          </div>
        );
      })}
    </div>
  );
}
