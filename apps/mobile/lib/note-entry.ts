/**
 * A timestamped text note used for chronological ordering in the timeline.
 *
 * Notes are stored in the `report_notes` table. This type is used for
 * in-memory representation during the generate screen editing session.
 */
export interface NoteEntry {
  /** `report_notes.id` when the entry has been persisted or optimistically queued. */
  id?: string;
  /** `report_notes.author_id`, used to display the note author. */
  authorId?: string;
  /** True while a text note exists only in the optimistic local cache. */
  isPending?: boolean;
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
 * Convert a `report_notes` row to a single prompt line.
 *
 * Text & voice notes contribute their body verbatim. Image/video/document
 * notes contribute a short placeholder string so the LLM is aware that
 * non-text evidence exists at that position and can cite it inline as
 * `[note N]`. The position-aligned ordering is preserved by the caller
 * (the LLM-facing index matches `report_notes.position`).
 */
export function noteRowToPromptLine(row: {
  kind: "text" | "voice" | "image" | "video" | "document";
  body: string | null;
}): string {
  switch (row.kind) {
    case "text":
    case "voice":
      return row.body ?? "";
    case "image":
      return "[image attached]";
    case "video":
      return "[video attached]";
    case "document":
      return "[document attached]";
  }
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
