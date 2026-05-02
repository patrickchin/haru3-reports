import { useMemo } from "react";
import { useProjectFiles } from "./useProjectFiles";
import type { NoteEntry } from "@/lib/note-entry";
import type { FileMetadataRow } from "@/lib/file-upload";

export type TimelineItem =
  | { kind: "text"; entry: NoteEntry; sourceIndex: number }
  | { kind: "file"; file: FileMetadataRow };

/**
 * Merge text notes and project files into a single chronologically-sorted
 * timeline. Text notes whose `source` is `'voice'` are excluded from the
 * UI timeline (VoiceNoteCard already shows the transcription) but they
 * remain in the underlying `NoteEntry[]` so the AI still receives them.
 *
 * File scoping for the current report (strict — the only files rendered
 * are ones explicitly linked through `report_notes.file_id`):
 *   1. If a file's id is in `excludedFileIds`, it's claimed by another
 *      report in the same project and is never shown here.
 *   2. If a file's id is in `linkedFileIds`, it belongs to this report
 *      and is included.
 *   3. Otherwise the file is *not* rendered. There is no time-window
 *      fallback — every file that participates in a report MUST have a
 *      `report_notes` row, which is what creates the link. A file with
 *      no link is a project asset, not part of this report.
 *
 * Sorted newest-first to match the current display order.
 */
export function useNoteTimeline(opts: {
  notes: readonly NoteEntry[];
  projectId: string | null | undefined;
  /** Retained for API compatibility; no longer used to scope files. */
  reportCreatedAt?: string | null;
  /** file_metadata ids explicitly linked to this report via report_notes.file_id. */
  linkedFileIds?: ReadonlySet<string>;
  /** file_metadata ids linked to *other* reports in the same project. */
  excludedFileIds?: ReadonlySet<string>;
  /**
   * Map of `file_metadata.id` → the linked `report_notes.created_at`.
   * When present, file rows are sorted by this timestamp (the moment
   * the user added the note to the report) instead of by the file's
   * own `created_at`. Display layer should also use this value so the
   * card's visible timestamp matches its sort position.
   */
  noteCreatedAtByFileId?: ReadonlyMap<string, string>;
}) {
  const {
    data: files,
    isLoading,
    error,
  } = useProjectFiles({
    projectId: opts.projectId,
  });

  const timeline = useMemo(() => {
    const items: TimelineItem[] = [];

    // Text notes — skip voice-sourced entries (shown via VoiceNoteCard)
    for (let i = 0; i < opts.notes.length; i++) {
      const entry = opts.notes[i];
      if (entry.source !== "voice") {
        items.push({ kind: "text", entry, sourceIndex: i });
      }
    }

    // Files — strictly require an explicit report_notes link.
    if (files) {
      for (const file of files) {
        if (opts.excludedFileIds?.has(file.id)) continue;
        if (!opts.linkedFileIds?.has(file.id)) continue;
        items.push({ kind: "file", file });
      }
    }

    // Newest first. For files, prefer the linked report_notes.created_at
    // (the moment the note was attached to the report) over the file's
    // own created_at — they can differ for files that were uploaded as
    // a project asset and later linked to a report.
    items.sort((a, b) => {
      const tsA =
        a.kind === "text"
          ? a.entry.addedAt
          : Date.parse(
              opts.noteCreatedAtByFileId?.get(a.file.id) ?? a.file.created_at,
            );
      const tsB =
        b.kind === "text"
          ? b.entry.addedAt
          : Date.parse(
              opts.noteCreatedAtByFileId?.get(b.file.id) ?? b.file.created_at,
            );
      return tsB - tsA;
    });

    return items;
  }, [
    opts.notes,
    files,
    opts.linkedFileIds,
    opts.excludedFileIds,
    opts.noteCreatedAtByFileId,
  ]);

  return { timeline, isLoading, error };
}
