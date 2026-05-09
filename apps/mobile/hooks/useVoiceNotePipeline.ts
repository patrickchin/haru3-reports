import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ScrollView } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { useSpeechToText } from "@/hooks/useSpeechToText";
import type { ReportNoteRow } from "@/hooks/useLocalReportNotes";
import type { FileMetadataRow } from "@/lib/file-upload";

export interface PendingVoiceNote {
  localId: string;
  audioUri: string;
  durationMs: number | null;
  addedAt: number;
  status: "uploading" | "transcribing" | "saved" | "failed";
  /** Which phase failed: "upload" or "transcribe". */
  failedPhase?: "upload" | "transcribe";
  error?: string;
  /** Filled once upload succeeds; survives retry-transcribe. */
  fileId?: string;
}

interface UseVoiceNotePipelineArgs {
  projectId: string | undefined;
  reportId: string | undefined;
  userId: string | undefined;
  noteRows: readonly ReportNoteRow[] | undefined;
  notesScrollRef: React.RefObject<ScrollView | null>;
  /**
   * Called once per successful voice note save. The hook guarantees no
   * duplicate calls for the same `fileId` (used to avoid creating two
   * `report_notes` rows on retry).
   */
  onVoiceNoteCreate: (args: {
    body: string | null;
    fileId: string;
  }) => void;
}

export function useVoiceNotePipeline({
  projectId,
  reportId,
  userId,
  noteRows,
  notesScrollRef,
  onVoiceNoteCreate,
}: UseVoiceNotePipelineArgs) {
  const queryClient = useQueryClient();

  const [pendingVoiceTranscriptionIds, setPendingVoiceTranscriptionIds] =
    useState<ReadonlySet<string>>(() => new Set());
  const [optimisticVoiceTranscriptionsByFileId, setOptimisticVoiceTranscriptionsByFileId] =
    useState<ReadonlyMap<string, string>>(() => new Map());
  const [pendingVoiceNotes, setPendingVoiceNotes] = useState<PendingVoiceNote[]>([]);

  // Map voice-note `file_id` → transcript body. Voice transcripts live in
  // `report_notes.body` (linked via `file_id`); the card itself just receives
  // the looked-up text.
  const voiceTranscriptionsByFileId = useMemo(() => {
    const transcriptions = new Map<string, string>(
      optimisticVoiceTranscriptionsByFileId,
    );
    for (const n of noteRows ?? []) {
      if (n.kind === "voice" && n.file_id && typeof n.body === "string") {
        transcriptions.set(n.file_id, n.body);
      }
    }
    return transcriptions;
  }, [noteRows, optimisticVoiceTranscriptionsByFileId]);

  // GC: drop optimistic entries once the real noteRows data contains them.
  useEffect(() => {
    if (!noteRows || optimisticVoiceTranscriptionsByFileId.size === 0) return;
    const dbFileIds = new Set(
      noteRows.filter((n) => n.kind === "voice" && n.file_id).map((n) => n.file_id!),
    );
    const stale = [...optimisticVoiceTranscriptionsByFileId.keys()].filter(
      (fid) => dbFileIds.has(fid),
    );
    if (stale.length > 0) {
      setOptimisticVoiceTranscriptionsByFileId((prev) => {
        const next = new Map(prev);
        for (const id of stale) next.delete(id);
        return next;
      });
    }
  }, [noteRows, optimisticVoiceTranscriptionsByFileId]);

  // Flip pending → "saved" once the report_notes row with the same
  // file_id appears. The entry stays alive (vs being filtered out)
  // so its localId remains the React key for the file row, preventing
  // an unmount/remount when the link query lands.
  useEffect(() => {
    if (!noteRows || pendingVoiceNotes.length === 0) return;
    const dbFileIds = new Set(
      noteRows.filter((n) => n.kind === "voice" && n.file_id).map((n) => n.file_id!),
    );
    setPendingVoiceNotes((prev) => {
      let changed = false;
      const next = prev.map((p) => {
        if (p.fileId && dbFileIds.has(p.fileId) && p.status !== "saved") {
          changed = true;
          return { ...p, status: "saved" as const, error: undefined };
        }
        return p;
      });
      return changed ? next : prev;
    });
  }, [noteRows, pendingVoiceNotes.length]);

  const handleVoiceNoteRecorded = useCallback(
    ({
      localId,
      audioUri,
      durationMs,
    }: { localId: string; audioUri: string; durationMs: number | null }) => {
      setPendingVoiceNotes((prev) => [
        ...prev,
        {
          localId,
          audioUri,
          durationMs,
          addedAt: Date.now(),
          status: "uploading",
        },
      ]);
      setTimeout(() => notesScrollRef.current?.scrollTo({ y: 0, animated: true }), 100);
    },
    [notesScrollRef],
  );

  const handleVoiceNoteUploaded = useCallback(
    ({ localId, metadata }: { localId: string; metadata: FileMetadataRow }) => {
      setPendingVoiceNotes((prev) =>
        prev.map((p) =>
          p.localId === localId
            ? { ...p, status: "transcribing", fileId: metadata.id, error: undefined }
            : p,
        ),
      );
      setPendingVoiceTranscriptionIds((previous) => {
        const next = new Set(previous);
        next.add(metadata.id);
        return next;
      });
      setOptimisticVoiceTranscriptionsByFileId((previous) => {
        const next = new Map(previous);
        next.delete(metadata.id);
        return next;
      });
      queryClient.setQueryData<FileMetadataRow[]>(
        ["project-files", metadata.project_id, { category: null, excludeCategory: null }],
        (previous) => {
          const current = previous ?? [];
          const withoutDuplicate = current.filter((file) => file.id !== metadata.id);
          return [metadata, ...withoutDuplicate].sort(
            (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at),
          );
        },
      );
      queryClient.invalidateQueries({ queryKey: ["project-files", metadata.project_id] });
      setTimeout(() => notesScrollRef.current?.scrollTo({ y: 0, animated: true }), 100);
    },
    [notesScrollRef, queryClient],
  );

  const handleVoiceNoteSaved = useCallback(
    ({
      localId,
      metadata,
      transcript,
    }: { localId: string; metadata: FileMetadataRow; transcript: string }) => {
      const trimmedTranscript = transcript.trim();
      setPendingVoiceNotes((prev) =>
        prev.map((p) =>
          p.localId === localId
            ? { ...p, status: "saved" as const, error: undefined }
            : p,
        ),
      );
      setPendingVoiceTranscriptionIds((previous) => {
        const next = new Set(previous);
        next.delete(metadata.id);
        return next;
      });
      setOptimisticVoiceTranscriptionsByFileId((previous) => {
        const next = new Map(previous);
        if (trimmedTranscript.length > 0) {
          next.set(metadata.id, trimmedTranscript);
        } else {
          next.delete(metadata.id);
        }
        return next;
      });
      // Persist a `report_notes` row linking the voice file to this draft.
      // The transcript becomes the note body so the LLM sees it like any
      // typed note. We ALWAYS create the row (even when transcription
      // returns empty) so the file is never an orphan in `file_metadata`
      // — failed transcriptions can be retried later.
      if (reportId && projectId) {
        // Dedup on retry-after-transcribe-fail. Without this guard a
        // successful transcription retry would create a duplicate
        // report_notes row pointing at the same file_id.
        const alreadyExists = (noteRows ?? []).some(
          (n) => n.kind === "voice" && n.file_id === metadata.id,
        );
        if (!alreadyExists) {
          onVoiceNoteCreate({
            body: trimmedTranscript.length > 0 ? trimmedTranscript : null,
            fileId: metadata.id,
          });
        }
      }
      queryClient.invalidateQueries({ queryKey: ["project-files", metadata.project_id] });
    },
    [noteRows, projectId, queryClient, reportId, onVoiceNoteCreate],
  );

  const handleVoiceNoteFailed = useCallback(
    ({
      localId,
      phase,
      error: errorMsg,
      metadata,
    }: {
      localId: string;
      phase: "upload" | "transcribe";
      error: string;
      metadata?: FileMetadataRow;
    }) => {
      setPendingVoiceNotes((prev) =>
        prev.map((p) =>
          p.localId === localId
            ? {
                ...p,
                status: "failed",
                failedPhase: phase,
                fileId: metadata?.id ?? p.fileId,
                error: errorMsg,
              }
            : p,
        ),
      );
      if (phase === "upload" && metadata) {
        setPendingVoiceTranscriptionIds((previous) => {
          const next = new Set(previous);
          next.delete(metadata.id);
          return next;
        });
      }
    },
    [],
  );

  const {
    isRecording,
    amplitude,
    interimTranscript,
    error: speechError,
    start: startListening,
    stop: stopListening,
    retryVoiceNote,
  } = useSpeechToText({
    onResult: () => {
      // Voice transcripts are persisted via `onVoiceNoteSaved`. This
      // callback only scrolls so the new note is in view.
      setTimeout(() => notesScrollRef.current?.scrollTo({ y: 0, animated: true }), 100);
    },
    saveVoiceNote: userId && projectId
      ? { projectId, uploadedBy: userId }
      : undefined,
    onVoiceNoteRecorded: handleVoiceNoteRecorded,
    onVoiceNoteUploaded: handleVoiceNoteUploaded,
    onVoiceNoteSaved: handleVoiceNoteSaved,
    onVoiceNoteFailed: handleVoiceNoteFailed,
  });

  const toggleRecording = useCallback(() => {
    if (isRecording) {
      stopListening();
    } else {
      startListening();
    }
  }, [isRecording, startListening, stopListening]);

  const handleRetryPendingVoice = useCallback(
    (localId: string) => {
      const entry = pendingVoiceNotes.find((p) => p.localId === localId);
      if (!entry) return;

      let existingMetadata: FileMetadataRow | undefined;
      if (entry.fileId && projectId) {
        const cached =
          queryClient.getQueryData<FileMetadataRow[]>([
            "project-files",
            projectId,
            { category: null, excludeCategory: null },
          ]) ?? [];
        existingMetadata = cached.find((f) => f.id === entry.fileId);
      }

      const nextStatus: "uploading" | "transcribing" =
        entry.failedPhase === "transcribe" && existingMetadata
          ? "transcribing"
          : "uploading";
      setPendingVoiceNotes((prev) =>
        prev.map((p) =>
          p.localId === localId
            ? { ...p, status: nextStatus, failedPhase: undefined, error: undefined }
            : p,
        ),
      );
      void retryVoiceNote({
        localId,
        audioUri: entry.audioUri,
        durationMs: entry.durationMs,
        existingMetadata,
      });
    },
    [pendingVoiceNotes, projectId, queryClient, retryVoiceNote],
  );

  const handleDiscardPendingVoice = useCallback((localId: string) => {
    setPendingVoiceNotes((prev) => prev.filter((p) => p.localId !== localId));
  }, []);

  return {
    // State for timeline/UI
    pendingVoiceNotes,
    pendingVoiceTranscriptionIds,
    voiceTranscriptionsByFileId,
    // Recording state
    isRecording,
    amplitude,
    interimTranscript,
    speechError,
    // Actions
    toggleRecording,
    handleRetryPendingVoice,
    handleDiscardPendingVoice,
  } as const;
}
