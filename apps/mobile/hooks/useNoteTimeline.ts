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
 * File scoping for the current report:
 *   1. If a file's id is in `excludedFileIds`, it's claimed by another
 *      report in the same project and is never shown here. This is the
 *      strict guard against the cross-report file leak.
 *   2. If a file's id is in `linkedFileIds` (derived from
 *      `report_notes.file_id`), it belongs to this report and is always
 *      included — regardless of timestamps.
 *   3. Otherwise, when `reportCreatedAt` is supplied, only files uploaded
 *      at or after the report's creation are included. This stops
 *      historical files from earlier drafts from leaking in.
 *   4. Without either signal, all project files are included (fallback).
 *
 * Sorted newest-first to match the current display order.
 */
export function useNoteTimeline(opts: {
  notes: readonly NoteEntry[];
  projectId: string | null | undefined;
  reportCreatedAt?: string | null;
  /** file_metadata ids explicitly linked to this report via report_notes.file_id. */
  linkedFileIds?: ReadonlySet<string>;
  /** file_metadata ids linked to *other* reports in the same project. */
  excludedFileIds?: ReadonlySet<string>;
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

    // Files — include if linked via report_notes, else fall back to time filter.
    if (files) {
      for (const file of files) {
        // 1. Linked to another report in this project → never include.
        if (opts.excludedFileIds?.has(file.id)) continue;
        // 2. Explicitly linked to *this* report → always include.
        if (opts.linkedFileIds?.has(file.id)) {
          items.push({ kind: "file", file });
          continue;
        }
        // 3. Not linked — apply time-based scoping when available.
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
  }, [opts.notes, files, reportCreatedTs, opts.linkedFileIds, opts.excludedFileIds]);

  return { timeline, isLoading, error };
}
