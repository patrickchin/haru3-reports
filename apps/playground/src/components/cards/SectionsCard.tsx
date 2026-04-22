import type { GeneratedReportSection } from "../../lib/generated-report";
import { formatSourceNotes } from "../../lib/report-helpers";

interface SectionsCardProps {
  sections: readonly GeneratedReportSection[];
}

export function SectionsCard({ sections }: SectionsCardProps) {
  if (sections.length === 0) return null;

  return (
    <>
      <span className="group-label">Summary Sections</span>
      {sections.map((section, i) => {
        const sourceNotes = formatSourceNotes(section.sourceNoteIndexes);
        return (
          <div key={`${section.title}-${i}`} className="card">
            <div className="section-header">
              <h3 className="section-title">{section.title}</h3>
            </div>
            <p className="section-content">{section.content}</p>
            {sourceNotes && <p className="source-notes">{sourceNotes}</p>}
          </div>
        );
      })}
    </>
  );
}
