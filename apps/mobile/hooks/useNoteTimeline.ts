import { useMemo } from "react";
import { useProjectFiles } from "./useProjectFiles";
import type { NoteEntry } from "@/lib/note-entry";
import type { FileMetadataRow } from "@/lib/file-upload";

/**
 * In-memory optimistic photo upload — appears in the timeline the
 * instant the user finishes capturing, before the network upload
 * completes. Lives only in screen state (no persistence): killing the
 * app mid-upload loses the pending entry.
 */
export interface PendingPhotoItem {
  /** Stable client-generated id used to key the row + correlate retry/discard. */
  localId: string;
  /** Local file:// URI for the full-resolution image (used by the upload pipeline). */
  localUri: string;
  /** Local file:// URI for the thumbnail rendered while uploading. */
  thumbnailUri: string;
  /** ms-since-epoch the photo was captured — drives timeline sort position. */
  addedAt: number;
  status: "uploading" | "failed";
  /** Human-readable error message when status === "failed". */
  error?: string;
}

/**
 * In-memory optimistic voice note — appears in the timeline the moment
 * the user stops recording, before upload + transcription complete.
 */
export interface PendingVoiceItem {
  localId: string;
  /** Local file:// URI for the recorded audio. */
  audioUri: string;
  /** Recording duration in ms, or null when unknown. */
  durationMs: number | null;
  addedAt: number;
  status: "uploading" | "transcribing" | "failed";
  /**
   * Which phase failed when `status === "failed"`. "upload" means the audio
   * never reached the server; "transcribe" means upload succeeded (and
   * `fileId` is set) but transcription failed — retry should target the
   * existing file rather than re-uploading.
   */
  failedPhase?: "upload" | "transcribe";
  /** Server `file_metadata.id`, populated once upload succeeds. */
  fileId?: string;
  error?: string;
}

export type TimelineItem =
  | { kind: "text"; entry: NoteEntry; sourceIndex: number }
  | { kind: "file"; file: FileMetadataRow }
  | { kind: "pending-photo"; pending: PendingPhotoItem }
  | { kind: "pending-voice"; pending: PendingVoiceItem };

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
 * Pending optimistic items (`pendingPhotos`, `pendingVoiceNotes`) are
 * merged in alongside real items and sorted by `addedAt`, so the UI
 * shows them at the moment of capture rather than when the upload
 * completes. Caller is responsible for removing pending entries once
 * the corresponding `file_metadata` row appears.
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
  /** Optimistic in-flight photo uploads — see {@link PendingPhotoItem}. */
  pendingPhotos?: readonly PendingPhotoItem[];
  /** Optimistic in-flight voice notes — see {@link PendingVoiceItem}. */
  pendingVoiceNotes?: readonly PendingVoiceItem[];
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

    // Optimistic pending items — appear immediately at their capture
    // timestamp so the user sees the row before upload finishes.
    for (const pending of opts.pendingPhotos ?? []) {
      items.push({ kind: "pending-photo", pending });
    }
    for (const pending of opts.pendingVoiceNotes ?? []) {
      items.push({ kind: "pending-voice", pending });
    }

    // Newest first. For files, prefer the linked report_notes.created_at
    // (the moment the note was attached to the report) over the file's
    // own created_at — they can differ for files that were uploaded as
    // a project asset and later linked to a report.
    items.sort((a, b) => {
      const tsA = timestampOf(a, opts.noteCreatedAtByFileId);
      const tsB = timestampOf(b, opts.noteCreatedAtByFileId);
      return tsB - tsA;
    });

    return items;
  }, [
    opts.notes,
    files,
    opts.linkedFileIds,
    opts.excludedFileIds,
    opts.noteCreatedAtByFileId,
    opts.pendingPhotos,
    opts.pendingVoiceNotes,
  ]);

  return { timeline, isLoading, error };
}

function timestampOf(
  item: TimelineItem,
  noteCreatedAtByFileId: ReadonlyMap<string, string> | undefined,
): number {
  switch (item.kind) {
    case "text":
      return item.entry.addedAt;
    case "file":
      return Date.parse(
        noteCreatedAtByFileId?.get(item.file.id) ?? item.file.created_at,
      );
    case "pending-photo":
    case "pending-voice":
      return item.pending.addedAt;
  }
}
