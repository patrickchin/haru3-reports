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
  /**
   * Server `file_metadata.id`, populated once upload succeeds. Lets the
   * timeline merge bridge the pending row → file row by matching
   * `file_metadata.id`, so React reuses the same outer Animated.View
   * across the swap (preventing the visible content shift the user
   * sees while the report_notes link row is still in flight).
   */
  fileId?: string;
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
  /**
   * "saved" means the report_notes row has been (or is about to be)
   * created — the entry is kept around so the timeline row's React key
   * stays stable through the pending → file swap. Cleared on screen
   * unmount. Treated identically to a confirmed file row by the
   * timeline (the matching `file_metadata` is rendered, not the pending
   * card), but its `localId` is what keys the row in both states.
   */
  status: "uploading" | "transcribing" | "saved" | "failed";
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
  | {
      kind: "file";
      file: FileMetadataRow;
      /**
       * Stable React key used by `NoteTimeline` for voice-note file rows
       * that originated as an optimistic pending entry. When set, the
       * file row reuses the pending entry's `localId` as its key so the
       * swap from `PendingVoiceCard` to `VoiceNoteCard` reuses the same
       * outer Animated.View instance — preventing the row from
       * unmounting and the list from visibly jumping.
       */
      voiceStableKey?: string;
      /**
       * Stable React key used by `NoteTimeline` for photo file rows
       * that originated as an optimistic pending entry. Mirrors
       * {@link voiceStableKey} — when set, the file row reuses the
       * pending entry's `localId` as its key so the swap from the
       * pending photo card to the file card reuses the same outer
       * Animated.View instance, preventing a visible content shift in
       * the timeline (R6: optimistic-row swap unmount).
       */
      photoStableKey?: string;
      /**
       * Capture-time timestamp inherited from the pending photo entry.
       * When set, the timeline sort uses this instead of
       * `file_metadata.created_at` (and any
       * `noteCreatedAtByFileId` value), so the row stays in the same
       * sort position across the pending → file swap. Without this,
       * sort order can jump because `report_notes.created_at` lands
       * 1–2s after capture time.
       */
      photoStableAddedAt?: number;
    }
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

    // Pending voice notes whose upload has completed already have a real
    // file_metadata row in `files`. Render them as the canonical file
    // row from that moment on (with `isTranscribing` true via the
    // transcribingFileIds passed to NoteTimeline) so the swap from
    // PendingVoiceCard → VoiceNoteCard happens at upload-completed
    // rather than at transcript-arrived. That way the transcript text
    // appears in-place inside the same VoiceNoteCard instance instead
    // of an unmount + mount that animates the whole row out and back
    // in. Files filtered in below use this set to bypass the
    // `linkedFileIds` gate, since the report_notes link row is created
    // ~one tick after the file metadata row appears in cache.
    const uploadedPendingVoiceFileIds = new Set<string>();
    // file_id → pending.localId. Used to give the post-upload file row
    // the same React key as the pending row it replaces, so the outer
    // Animated.View persists across the swap and the row morphs in
    // place instead of unmounting + remounting (which makes the list
    // visibly jump).
    const pendingLocalIdByFileId = new Map<string, string>();
    for (const pending of opts.pendingVoiceNotes ?? []) {
      if (pending.fileId) {
        uploadedPendingVoiceFileIds.add(pending.fileId);
        pendingLocalIdByFileId.set(pending.fileId, pending.localId);
      }
    }

    // Same pattern for pending photos: once the upload queue reports a
    // server `fileId`, bridge the pending row → file row in this merge
    // so the swap is invisible to React (same key + same sort
    // timestamp). Without this, the user sees the timeline content
    // shift the moment a photo upload completes — Bug R6 photo case.
    const uploadedPendingPhotoFileIds = new Set<string>();
    const pendingPhotoLocalIdByFileId = new Map<string, string>();
    const pendingPhotoAddedAtByFileId = new Map<string, number>();
    for (const pending of opts.pendingPhotos ?? []) {
      if (pending.fileId) {
        uploadedPendingPhotoFileIds.add(pending.fileId);
        pendingPhotoLocalIdByFileId.set(pending.fileId, pending.localId);
        pendingPhotoAddedAtByFileId.set(pending.fileId, pending.addedAt);
      }
    }

    // Files — strictly require an explicit report_notes link, EXCEPT
    // for files that correspond to a pending voice or photo upload that
    // just completed (see comments above).
    if (files) {
      for (const file of files) {
        if (opts.excludedFileIds?.has(file.id)) continue;
        const isPendingVoiceUpload = uploadedPendingVoiceFileIds.has(file.id);
        const isPendingPhotoUpload = uploadedPendingPhotoFileIds.has(file.id);
        if (
          !isPendingVoiceUpload &&
          !isPendingPhotoUpload &&
          !opts.linkedFileIds?.has(file.id)
        ) {
          continue;
        }
        const voiceStableKey = pendingLocalIdByFileId.get(file.id);
        const photoStableKey = pendingPhotoLocalIdByFileId.get(file.id);
        const photoStableAddedAt = pendingPhotoAddedAtByFileId.get(file.id);
        const item: TimelineItem = { kind: "file", file };
        if (voiceStableKey) item.voiceStableKey = voiceStableKey;
        if (photoStableKey) item.photoStableKey = photoStableKey;
        if (photoStableAddedAt !== undefined) {
          item.photoStableAddedAt = photoStableAddedAt;
        }
        items.push(item);
      }
    }

    // Optimistic pending items — appear immediately at their capture
    // timestamp so the user sees the row before upload finishes. Skip
    // pending entries whose fileId is already represented by a real
    // file row above (handled by the bridge), to avoid an unmount +
    // mount when the link row lands.
    for (const pending of opts.pendingPhotos ?? []) {
      if (pending.fileId && uploadedPendingPhotoFileIds.has(pending.fileId)) {
        continue;
      }
      items.push({ kind: "pending-photo", pending });
    }
    const knownFileIds = new Set(files?.map((f) => f.id) ?? []);
    for (const pending of opts.pendingVoiceNotes ?? []) {
      if (pending.fileId && knownFileIds.has(pending.fileId)) continue;
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
      // Photo bridging: when a pending-photo entry has been promoted
      // to a file row mid-upload, sort by the original capture time so
      // the row doesn't jump position when report_notes.created_at
      // (which lands ~1–2s later) overrides it.
      if (item.photoStableAddedAt !== undefined) {
        return item.photoStableAddedAt;
      }
      return Date.parse(
        noteCreatedAtByFileId?.get(item.file.id) ?? item.file.created_at,
      );
    case "pending-photo":
    case "pending-voice":
      return item.pending.addedAt;
  }
}
