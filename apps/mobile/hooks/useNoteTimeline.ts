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
 * When `reportCreatedAt` is supplied, only files uploaded at or after the
 * report's creation timestamp are included. This stops historical voice
 * notes / images from earlier drafts in the same project from leaking into
 * the current draft. (`file_metadata` has no per-report scope on the
 * server — the report → file linkage lives via `report_notes.file_id`.)
 *
 * Sorted newest-first to match the current display order.
 */
export function useNoteTimeline(opts: {
  notes: readonly NoteEntry[];
  projectId: string | null | undefined;
  reportCreatedAt?: string | null;
}) {
  const {
    data: files,
    isLoading,
    error,
  } = useProjectFiles({
    projectId: opts.projectId,
  });

  const reportCreatedTs = opts.reportCreatedAt
    ? Date.parse(opts.reportCreatedAt)
    : null;

  const timeline = useMemo(() => {
    const items: TimelineItem[] = [];

    // Text notes — skip voice-sourced entries (shown via VoiceNoteCard)
    for (let i = 0; i < opts.notes.length; i++) {
      const entry = opts.notes[i];
      if (entry.source !== "voice") {
        items.push({ kind: "text", entry, sourceIndex: i });
      }
    }

    // Files — scope to the current report by creation time when known.
    if (files) {
      for (const file of files) {
        if (reportCreatedTs !== null) {
          const fileTs = Date.parse(file.created_at);
          if (Number.isFinite(fileTs) && fileTs < reportCreatedTs) continue;
        }
        items.push({ kind: "file", file });
      }
    }

    // Newest first
    items.sort((a, b) => {
      const tsA =
        a.kind === "text" ? a.entry.addedAt : Date.parse(a.file.created_at);
      const tsB =
        b.kind === "text" ? b.entry.addedAt : Date.parse(b.file.created_at);
      return tsB - tsA;
    });

    return items;
  }, [opts.notes, files, reportCreatedTs]);

  return { timeline, isLoading, error };
}
