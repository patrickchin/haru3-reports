import { useState, useRef, useEffect } from "react";

interface NoteInputProps {
  onAdd: (note: string) => void;
  disabled?: boolean;
}

export function NoteInput({ onAdd, disabled }: NoteInputProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [value]);

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setValue("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="note-input-container">
      <textarea
        ref={textareaRef}
        className="note-input"
        placeholder="Type a site note… (Enter to add, Shift+Enter for newline)"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        rows={1}
        disabled={disabled}
      />
      <button
        className="btn btn-primary btn-sm"
        onClick={submit}
        disabled={!value.trim() || disabled}
      >
        + Add note
      </button>
    </div>
  );
}
