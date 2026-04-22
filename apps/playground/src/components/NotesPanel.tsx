interface NotesPanelProps {
  notes: readonly string[];
  onRemove: (index: number) => void;
}

export function NotesPanel({ notes, onRemove }: NotesPanelProps) {
  if (notes.length === 0) {
    return (
      <div className="notes-empty">
        <p className="notes-empty-text">No notes yet.</p>
        <p className="notes-empty-hint">
          Type a site observation below or load a sample set to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="notes-list">
      {notes.map((note, index) => (
        <div key={`${index}-${note.slice(0, 20)}`} className="note-row">
          <span className="note-index">[{index + 1}]</span>
          <span className="note-text">{note}</span>
          <button
            className="note-remove"
            onClick={() => onRemove(index)}
            title="Remove note"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
