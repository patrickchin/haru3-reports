import { View, Text } from "react-native";
import { useMemo } from "react";
import { useProjectFiles } from "@/hooks/useProjectFiles";
import { VoiceNoteCard } from "@/components/voice-notes/VoiceNoteCard";
import { FileCard } from "./FileCard";
import { type FileMetadataRow } from "@/lib/file-upload";
import { type ReportNoteRow } from "@/lib/local-db/repositories/report-notes-repo";

interface ReportLinkedFilesProps {
  projectId: string;
  /**
   * `report_notes` rows for the current report. Files render only when
   * a note row references them via `file_id`. This is the single
   * source of truth — files in `file_metadata` that are not linked are
   * project assets, not part of the report, and must not appear here.
   */
  noteRows: readonly ReportNoteRow[] | undefined;
  onOpenFile?: (file: FileMetadataRow) => void;
}

/**
 * Renders the voice notes, photos, and documents that belong to a
 * report — discovered through `report_notes.file_id`, not the project's
 * full file list. Prevents:
 *
 *   1. Orphan leakage: a `file_metadata` row with no `report_notes` link
 *      never renders here, so users see exactly what the report contains.
 *   2. Cross-report leakage: files attached to a different report in the
 *      same project never render here.
 */
export function ReportLinkedFiles({
  projectId,
  noteRows,
  onOpenFile,
}: ReportLinkedFilesProps) {
  const { data: allFiles, isLoading, error } = useProjectFiles({ projectId });

  const linkedFileIds = useMemo(() => {
    const ids = new Set<string>();
    for (const note of noteRows ?? []) {
      if (note.file_id && !note.deleted_at) ids.add(note.file_id);
    }
    return ids;
  }, [noteRows]);

  const linkedFiles = useMemo(() => {
    if (!allFiles) return [] as FileMetadataRow[];
    return allFiles.filter((file) => linkedFileIds.has(file.id));
  }, [allFiles, linkedFileIds]);

  if (isLoading && linkedFileIds.size > 0) {
    return (
      <Text className="text-sm text-muted-foreground" testID="report-files-loading">
        Loading files…
      </Text>
    );
  }
  if (error) {
    return (
      <Text className="text-sm text-danger-foreground" selectable>
        Could not load files: {error.message}
      </Text>
    );
  }
  if (linkedFiles.length === 0) return null;

  const voiceFiles = linkedFiles.filter((f) => f.category === "voice-note");
  const otherFiles = linkedFiles.filter((f) => f.category !== "voice-note");

  return (
    <View className="gap-2" testID="report-linked-files">
      {voiceFiles.map((file) => (
        <VoiceNoteCard key={file.id} file={file} readOnly />
      ))}
      {otherFiles.map((file) => (
        <FileCard key={file.id} file={file} readOnly onOpen={onOpenFile} />
      ))}
    </View>
  );
}
