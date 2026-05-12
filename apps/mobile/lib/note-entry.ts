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
 * Convert a sorted `report_notes` row array to prompt lines.
 *
 * Text & voice notes contribute their body verbatim. Image/video/document
 * notes contribute a numbered placeholder string ("[image 1]", "[image 2]",
 * "[video 1]", "[document 1]" …) so the LLM is aware of the attachment and
 * its ordinal among same-kind attachments. Caller must pass rows already
 * sorted by `position`; output index aligns 1:1 with the input array.
 */
export function noteRowsToPromptLines(
  rows: readonly {
    kind: "text" | "voice" | "image" | "video" | "document";
    body: string | null;
  }[],
): string[] {
  const counters: Record<"image" | "video" | "document", number> = {
    image: 0,
    video: 0,
    document: 0,
  };
  return rows.map((row) => {
    switch (row.kind) {
      case "text":
      case "voice":
        return row.body ?? "";
      case "image":
        return `[image ${++counters.image}]`;
      case "video":
        return `[video ${++counters.video}]`;
      case "document":
        return `[document ${++counters.document}]`;
    }
  });
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
