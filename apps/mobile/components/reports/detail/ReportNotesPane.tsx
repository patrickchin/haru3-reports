import { useMemo } from "react";
import { View, Text } from "react-native";
import { MessageSquare } from "lucide-react-native";
import { useQuery } from "@tanstack/react-query";
import { EmptyState } from "@/components/ui/EmptyState";
import { NoteTimeline } from "@/components/notes/NoteTimeline";
import { useNoteTimeline } from "@/hooks/useNoteTimeline";
import { useOtherReportFileIds, type ReportNoteRow } from "@/hooks/useLocalReportNotes";
import { fetchProjectTeam } from "@/lib/project-members";
import { colors } from "@/lib/design-tokens/colors";
import type { NoteEntry } from "@/lib/note-entry";
import type { FileMetadataRow } from "@/lib/file-upload";

interface ReportNotesPaneProps {
  projectId: string;
  reportId: string;
  reportCreatedAt: string | null;
  noteRows: readonly ReportNoteRow[] | undefined;
  onOpenFile: (file: FileMetadataRow) => void;
}

/**
 * Read-only source-notes timeline for a finalised report. Mirrors the
 * Notes tab in `apps/mobile/components/reports/generate/NotesTabPane.tsx`
 * (text, voice, photo, document rows) but without any capture, mutation,
 * or pending-upload concerns — saved reports never have in-flight notes.
 */
export function ReportNotesPane({
  projectId,
  reportId,
  reportCreatedAt,
  noteRows,
  onOpenFile,
}: ReportNotesPaneProps) {
  const { data: team } = useQuery({
    queryKey: ["project-team", projectId],
    queryFn: () => fetchProjectTeam(projectId),
    enabled: !!projectId,
  });

  const memberNames = useMemo(() => {
    const map = new Map<string, string>();
    if (team) {
      for (const m of team) {
        if (m.full_name) map.set(m.user_id, m.full_name);
      }
    }
    return map;
  }, [team]);

  const notesList = useMemo<NoteEntry[]>(
    () =>
      (noteRows ?? [])
        .filter((n) => typeof n.body === "string" && n.body.length > 0)
        .map((n) => ({
          id: n.id,
          authorId: n.author_id,
          text: n.body!,
          addedAt: Date.parse(n.created_at) || 0,
          source: n.kind === "voice" ? "voice" : "text",
        })),
    [noteRows],
  );

  const linkedFileIds = useMemo(() => {
    const ids = new Set<string>();
    for (const n of noteRows ?? []) {
      if (n.file_id) ids.add(n.file_id);
    }
    return ids;
  }, [noteRows]);

  const noteCreatedAtByFileId = useMemo(() => {
    const m = new Map<string, string>();
    for (const n of noteRows ?? []) {
      if (n.file_id && n.created_at) m.set(n.file_id, n.created_at);
    }
    return m;
  }, [noteRows]);

  const noteAuthorByFileId = useMemo(() => {
    const m = new Map<string, string>();
    for (const n of noteRows ?? []) {
      if (n.file_id && n.author_id) m.set(n.file_id, n.author_id);
    }
    return m;
  }, [noteRows]);

  // Voice-note transcripts are persisted as `report_notes.body` on the
  // voice-kind row. Build the same `transcriptionsByFileId` map the
  // generate screen feeds VoiceNoteCard, so saved reports show the
  // transcription beneath each voice note row exactly like during capture.
  const voiceTranscriptionsByFileId = useMemo(() => {
    const m = new Map<string, string>();
    for (const n of noteRows ?? []) {
      if (n.kind === "voice" && n.file_id && n.body) m.set(n.file_id, n.body);
    }
    return m;
  }, [noteRows]);

  const { data: excludedFileIds } = useOtherReportFileIds(projectId, reportId);

  const { timeline, isLoading: timelineLoading } = useNoteTimeline({
    notes: notesList,
    projectId,
    reportCreatedAt,
    linkedFileIds,
    excludedFileIds,
    noteCreatedAtByFileId,
  });

  return (
    <View className="px-5 pb-8 pt-2">
      <NoteTimeline
        timeline={timeline}
        isLoading={timelineLoading}
        transcriptionsByFileId={voiceTranscriptionsByFileId}
        memberNames={memberNames}
        noteCreatedAtByFileId={noteCreatedAtByFileId}
        noteAuthorByFileId={noteAuthorByFileId}
        onOpenFile={onOpenFile}
        readOnly
      />

      {timeline.length === 0 && !timelineLoading && (
        <EmptyState
          icon={<MessageSquare size={28} color={colors.muted.foreground} />}
          title="No source notes"
          description="This report has no linked notes, voice memos, photos, or documents."
        />
      )}

      {timeline.length > 0 && (
        <Text className="mt-4 text-xs text-muted-foreground">
          The original notes this report was generated from.
        </Text>
      )}
    </View>
  );
}
