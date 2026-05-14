import * as samples from "../lib/sample-notes";

const SAMPLE_SETS: { label: string; notes: string[] }[] = [
  { label: "Commercial Build Day (50)", notes: samples.COMMERCIAL_BUILD_DAY },
  { label: "Resi Renovation (17)", notes: samples.RESI_RENOVATION },
  { label: "Road Works (24)", notes: samples.ROAD_WORKS },
  { label: "High-Rise Pour (29)", notes: samples.HIGHRISE_POUR },
  { label: "Interior Fitout (20)", notes: samples.INTERIOR_FITOUT },
  { label: "Quiet Day (9)", notes: samples.QUIET_DAY },
  { label: "Messy Transcription (11)", notes: samples.MESSY_TRANSCRIPTION },
  { label: "Rambling Notes (3)", notes: samples.RAMBLING_NOTES },
  { label: "Technical Notes (7)", notes: samples.TECHNICAL_NOTES },
  { label: "Materials Heavy (18)", notes: samples.MATERIALS_HEAVY_DAY },
  { label: "Equipment Heavy (19)", notes: samples.EQUIPMENT_HEAVY_DAY },
  { label: "Delivery Tracking (14)", notes: samples.DELIVERY_TRACKING_DAY },
  { label: "Plant Intensive (16)", notes: samples.PLANT_INTENSIVE_DAY },
  { label: "Materials Quality Issues (11)", notes: samples.MATERIALS_QUALITY_ISSUES },
  { label: "Warehouse Build (16)", notes: samples.WAREHOUSE_BUILD },
  { label: "Earthworks Day (14)", notes: samples.EARTHWORKS_DAY },
];

interface SampleNotesMenuProps {
  onLoad: (notes: string[]) => void;
  onReset: () => void;
  onRegenerate: () => void;
  hasNotes: boolean;
  isUpdating?: boolean;
}

export function SampleNotesMenu({
  onLoad,
  onReset,
  onRegenerate,
  hasNotes,
  isUpdating,
}: SampleNotesMenuProps) {
  return (
    <div className="sample-menu">
      <div className="sample-menu-header">
        <span className="sample-menu-label">Load a sample set</span>
      </div>

      <select
        className="sample-select"
        value=""
        onChange={(e) => {
          const idx = Number(e.target.value);
          const set = SAMPLE_SETS[idx];
          if (set) onLoad(set.notes);
        }}
      >
        <option value="" disabled>
          Choose sample notes…
        </option>
        {SAMPLE_SETS.map((set, i) => (
          <option key={set.label} value={i}>
            {set.label}
          </option>
        ))}
      </select>

      {hasNotes && (
        <div className="sample-actions">
          <button className="btn btn-danger-outline btn-sm" onClick={onReset}>
            Reset
          </button>
          <button className="btn btn-outline btn-sm" onClick={onRegenerate} disabled={isUpdating}>
            Regenerate from scratch
          </button>
        </div>
      )}
    </div>
  );
}
