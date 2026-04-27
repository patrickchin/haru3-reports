import type { GeneratedReportSection } from "../../lib/generated-report";
import { formatSourceNotes } from "../../lib/report-helpers";
import { sectionToText, sectionsToText } from "../../lib/report-to-text";
import { CopyButton } from "../CopyButton";

interface SectionsCardProps {
  sections: readonly GeneratedReportSection[];
}

export function SectionsCard({ sections }: SectionsCardProps) {
  if (sections.length === 0) return null;

  return (
    <>
      <div className="sections-group-header">
        <span className="group-label">Summary Sections</span>
        <CopyButton
          label="Copy all sections"
          getValue={() => sectionsToText(sections)}
        />
      </div>
      {sections.map((section, i) => {
        const sourceNotes = formatSourceNotes(section.sourceNoteIndexes);
        return (
          <div key={`${section.title}-${i}`} className="card">
            <div className="section-header">
              <h3 className="section-title">{section.title}</h3>
              <CopyButton
                label={`Copy section: ${section.title}`}
                getValue={() => sectionToText(section)}
              />
            </div>
            <p className="section-content">{section.content}</p>
            {sourceNotes && <p className="source-notes">{sourceNotes}</p>}
          </div>
        );
      })}
    </>
  );
}
