
interface HeaderProps {
  noteCount: number;
  onClearKey: () => void;
  onOpenSettings: () => void;
}

export function Header({
  noteCount,
  onClearKey,
  onOpenSettings,
}: HeaderProps) {
  return (
    <header className="header">
      <div className="header-left">
        <span className="brand-box">H</span>
        <span className="brand-text">
          Harpa Pro <span className="brand-sub">Playground</span>
        </span>
      </div>

      <div className="header-right">
        {noteCount > 0 && (
          <span className="note-count-badge">{noteCount} note{noteCount !== 1 ? "s" : ""}</span>
        )}
        <button className="btn btn-set-keys" onClick={onOpenSettings}>
          Set API Keys
        </button>
        <button className="btn btn-ghost" onClick={onClearKey}>
          Clear key
        </button>
      </div>
    </header>
  );
}
