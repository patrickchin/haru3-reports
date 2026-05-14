import { useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_PROMPT_ID,
  type PromptVersion,
  create as libCreate,
  duplicate as libDuplicate,
  exportAll,
  getActive,
  importAll,
  list as libList,
  remove as libRemove,
  setActive as libSetActive,
  update as libUpdate,
} from "../lib/prompt-library";

interface Props {
  /** Called whenever the active prompt or its content changes. */
  onActiveChange: (active: PromptVersion | null) => void;
  /** Disable editing (e.g., during generation). */
  disabled?: boolean;
}

/**
 * Prompt editing surface for the playground. Manages the local prompt library
 * and surfaces the *active* prompt to the parent so the request hook can send
 * `systemPromptOverride` when a non-default prompt is selected.
 *
 * Saves are explicit (not autosaved) so accidental edits don't silently change
 * the prompt that gets sent on the next Generate.
 */
export function PromptEditor({ onActiveChange, disabled }: Props) {
  const [items, setItems] = useState<PromptVersion[]>(() => libList());
  const [activeId, setActiveId] = useState<string>(
    () => getActive()?.id ?? DEFAULT_PROMPT_ID,
  );
  const active = items.find((p) => p.id === activeId) ?? null;

  // Working copy of the textarea — only flushed on Save.
  const [draft, setDraft] = useState<string>(active?.systemPrompt ?? "");
  const [draftName, setDraftName] = useState<string>(active?.name ?? "");
  const [softWrap, setSoftWrap] = useState(true);
  const [importError, setImportError] = useState<string | null>(null);
  const [transientStatus, setTransientStatus] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Whenever the active id changes, hydrate the draft from storage.
  useEffect(() => {
    const next = libList().find((p) => p.id === activeId) ?? null;
    setItems(libList());
    setDraft(next?.systemPrompt ?? "");
    setDraftName(next?.name ?? "");
    onActiveChange(next);
  }, [activeId, onActiveChange]);

  const isDirty = useMemo(() => {
    if (!active) return false;
    return draft !== active.systemPrompt || draftName !== active.name;
  }, [active, draft, draftName]);

  const isReadOnly = active?.readOnly ?? false;

  const flash = (msg: string) => {
    setTransientStatus(msg);
    window.setTimeout(() => setTransientStatus(null), 1500);
  };

  const refresh = () => setItems(libList());

  const handleSelect = (id: string) => {
    libSetActive(id);
    setActiveId(id);
  };

  const handleSave = () => {
    if (!active || isReadOnly || !isDirty) return;
    libUpdate(active.id, { name: draftName, systemPrompt: draft });
    refresh();
    flash("Saved");
  };

  const handleSaveAs = () => {
    if (!draft.trim()) return;
    const baseName = draftName?.trim() || "Custom prompt";
    const created = libCreate({
      name: baseName,
      systemPrompt: draft,
      basedOn: active?.id,
    });
    setActiveId(created.id);
    refresh();
    flash("Saved as new version");
  };

  const handleDuplicate = () => {
    if (!active) return;
    const dup = libDuplicate(active.id);
    setActiveId(dup.id);
    refresh();
  };

  const handleDelete = () => {
    if (!active || isReadOnly) return;
    if (!window.confirm(`Delete prompt "${active.name}"?`)) return;
    libRemove(active.id);
    setActiveId(DEFAULT_PROMPT_ID);
    refresh();
  };

  const handleResetToDefault = () => {
    setActiveId(DEFAULT_PROMPT_ID);
  };

  const handleRevert = () => {
    if (!active) return;
    setDraft(active.systemPrompt);
    setDraftName(active.name);
  };

  const handleExport = () => {
    const payload = exportAll();
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `playground-prompts-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportClick = () => {
    setImportError(null);
    fileInputRef.current?.click();
  };

  const handleImportChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const result = importAll(json);
      refresh();
      flash(`Imported ${result.imported} prompt${result.imported === 1 ? "" : "s"}`);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Import failed");
    }
  };

  // Cheap token estimate. Real tokeniser would be ~10× more code; this is good
  // enough for "is my prompt getting too long" feedback while editing.
  const charCount = draft.length;
  const tokenEstimate = Math.ceil(charCount / 4);
  const SOFT_LIMIT = 8000; // tokens

  return (
    <div className="prompt-editor">
      <div className="prompt-editor-toolbar">
        <select
          className="prompt-editor-select"
          value={activeId}
          onChange={(e) => handleSelect(e.target.value)}
          disabled={disabled}
          aria-label="Active prompt"
        >
          {items.map((p) => (
            <option key={p.id} value={p.id}>
              {p.readOnly ? "★ " : ""}
              {p.name}
            </option>
          ))}
        </select>

        <input
          type="text"
          className="prompt-editor-name"
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          disabled={disabled || isReadOnly}
          placeholder="Prompt name"
          aria-label="Prompt name"
        />

        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={handleSave}
          disabled={disabled || isReadOnly || !isDirty}
          title={isReadOnly ? "Default prompt is read-only — use Save as new" : "Save changes"}
        >
          Save
        </button>
        <button
          type="button"
          className="btn btn-outline btn-sm"
          onClick={handleSaveAs}
          disabled={disabled || !draft.trim()}
        >
          Save as new
        </button>
        <button
          type="button"
          className="btn btn-outline btn-sm"
          onClick={handleDuplicate}
          disabled={disabled || !active}
        >
          Duplicate
        </button>
        <button
          type="button"
          className="btn btn-outline btn-sm"
          onClick={handleResetToDefault}
          disabled={disabled || activeId === DEFAULT_PROMPT_ID}
          title="Switch back to the production default prompt"
        >
          Use default
        </button>
        <button
          type="button"
          className="btn btn-danger-outline btn-sm"
          onClick={handleDelete}
          disabled={disabled || isReadOnly || !active}
        >
          Delete
        </button>
        <span className="prompt-editor-spacer" />
        <button
          type="button"
          className="btn btn-outline btn-sm"
          onClick={handleExport}
          title="Download all saved prompts as JSON"
        >
          Export
        </button>
        <button
          type="button"
          className="btn btn-outline btn-sm"
          onClick={handleImportClick}
          title="Import prompts from a JSON export"
        >
          Import
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          style={{ display: "none" }}
          onChange={handleImportChange}
        />
      </div>

      <div className="prompt-editor-meta">
        {isReadOnly && (
          <span className="prompt-editor-badge prompt-editor-badge-info">
            read-only — duplicate to edit
          </span>
        )}
        {!isReadOnly && isDirty && (
          <span className="prompt-editor-badge prompt-editor-badge-warn">
            unsaved changes
          </span>
        )}
        <span className="prompt-editor-stat">
          {charCount.toLocaleString()} chars · ~{tokenEstimate.toLocaleString()} tokens
          {tokenEstimate > SOFT_LIMIT && (
            <span className="prompt-editor-warn"> (large)</span>
          )}
        </span>
        {!isReadOnly && isDirty && (
          <button
            type="button"
            className="btn btn-outline btn-sm prompt-editor-revert"
            onClick={handleRevert}
          >
            revert
          </button>
        )}
        <label className="prompt-editor-wrap">
          <input
            type="checkbox"
            checked={softWrap}
            onChange={(e) => setSoftWrap(e.target.checked)}
          />
          soft-wrap
        </label>
        {transientStatus && (
          <span className="prompt-editor-status">{transientStatus}</span>
        )}
        {importError && (
          <span className="prompt-editor-error">Import failed: {importError}</span>
        )}
      </div>

      <textarea
        className="prompt-editor-textarea"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        readOnly={isReadOnly}
        disabled={disabled}
        spellCheck={false}
        wrap={softWrap ? "soft" : "off"}
        rows={24}
        aria-label="System prompt"
      />
    </div>
  );
}
