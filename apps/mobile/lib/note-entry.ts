/**
 * A timestamped text note used for chronological ordering in the timeline.
 *
 * The `reports.notes` column is `text[]` — we keep backward compatibility
 * by converting to/from plain string arrays at persistence boundaries.
 */
export interface NoteEntry {
  text: string;
  /** `Date.now()` at the moment the note was added. */
  addedAt: number;
  /** `'voice'` when the text came from voice-note transcription. Hidden in
   *  the timeline UI (the VoiceNoteCard already shows the transcription)
   *  but still sent to the AI for report generation. */
  source?: "voice" | "text";
}

/** Convert entries to the plain `text[]` stored in the DB / sent to the AI. */
export function toTextArray(entries: readonly NoteEntry[]): string[] {
  return entries.map((e) => e.text);
}

/**
 * Rebuild `NoteEntry[]` from a persisted `text[]`.
 *
 * Since the DB column carries no timestamps we assign synthetic ones
 * spaced 1 ms apart starting from `baseTimestamp` (defaults to now).
 * This preserves the relative ordering within the text notes while
 * keeping them sortable against `file_metadata.created_at` values.
 */
export function fromTextArray(
  texts: readonly string[],
  baseTimestamp?: number,
): NoteEntry[] {
  const base = baseTimestamp ?? Date.now();
  return texts.map((text, i) => ({
    text,
    addedAt: base + i,
    source: "text" as const,
  }));
}
