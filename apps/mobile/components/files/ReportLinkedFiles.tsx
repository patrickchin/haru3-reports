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
  /** Optional user_id → display name lookup, used to surface the
   *  attaching user's name on each card. */
  memberNames?: ReadonlyMap<string, string>;
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
  memberNames,
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

  // Map file_id → { capturedAt, authorId } from report_notes so cards
  // display the moment the file was attached to the report rather than
  // the file's own upload timestamp.
  const noteMetaByFileId = useMemo(() => {
    const m = new Map<string, { capturedAt: string; authorId: string | null }>();
    for (const note of noteRows ?? []) {
      if (note.file_id && !note.deleted_at) {
        m.set(note.file_id, {
          capturedAt: note.created_at,
          authorId: note.author_id ?? null,
        });
      }
    }
    return m;
  }, [noteRows]);

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
      {voiceFiles.map((file) => {
        const meta = noteMetaByFileId.get(file.id);
        return (
          <VoiceNoteCard
            key={file.id}
            file={file}
            readOnly
            capturedAt={meta?.capturedAt ?? null}
            authorName={
              meta?.authorId
                ? (memberNames?.get(meta.authorId) ?? null)
                : (memberNames?.get(file.uploaded_by) ?? null)
            }
          />
        );
      })}
      {otherFiles.map((file) => {
        const meta = noteMetaByFileId.get(file.id);
        return (
          <FileCard
            key={file.id}
            file={file}
            readOnly
            onOpen={onOpenFile}
            capturedAt={meta?.capturedAt ?? null}
            authorName={
              meta?.authorId
                ? (memberNames?.get(meta.authorId) ?? null)
                : (memberNames?.get(file.uploaded_by) ?? null)
            }
          />
        );
      })}
    </View>
  );
}
