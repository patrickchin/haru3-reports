import { View } from "react-native";
import { useMemo } from "react";
import { Camera } from "lucide-react-native";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { FileCard } from "@/components/files/FileCard";
import { useProjectFiles } from "@/hooks/useProjectFiles";
import { type FileMetadataRow } from "@/lib/file-upload";
import { type ReportNoteRow } from "@/hooks/useLocalReportNotes";
import { colors } from "@/lib/design-tokens/colors";

interface ReportPhotosProps {
  projectId: string;
  /**
   * `report_notes` rows for the current report. Photos render only when
   * a note row references them via `file_id` AND the linked
   * `file_metadata` row has `category === "image"`. Mirrors the
   * filtering rule in `ReportLinkedFiles` so unlinked project assets
   * never leak into a report's photo strip.
   */
  noteRows: readonly ReportNoteRow[] | undefined;
  /** Optional user_id → display name lookup for the FileCard byline. */
  memberNames?: ReadonlyMap<string, string>;
  onOpenFile?: (file: FileMetadataRow) => void;
}

/**
 * "Photos" section rendered at the bottom of a report (both draft and
 * finalized views). Image-only counterpart to `ReportLinkedFiles`,
 * intentionally narrow so the report body itself remains a clean
 * structured summary while still surfacing the captured photos
 * inline. Voice notes and documents stay in the Notes tab.
 */
export function ReportPhotos({
  projectId,
  noteRows,
  memberNames,
  onOpenFile,
}: ReportPhotosProps) {
  const { data: allFiles } = useProjectFiles({ projectId });

  const linkedFileIds = useMemo(() => {
    const ids = new Set<string>();
    for (const note of noteRows ?? []) {
      if (note.file_id && !note.deleted_at) ids.add(note.file_id);
    }
    return ids;
  }, [noteRows]);

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

  const photos = useMemo(() => {
    if (!allFiles) return [] as FileMetadataRow[];
    return allFiles.filter(
      (f) => f.category === "image" && linkedFileIds.has(f.id),
    );
  }, [allFiles, linkedFileIds]);

  if (photos.length === 0) return null;

  return (
    <Card variant="default" padding="lg" testID="report-photos">
      <SectionHeader
        title="Photos"
        icon={<Camera size={16} color={colors.foreground} />}
      />
      <View className="mt-4 gap-2">
        {photos.map((file) => {
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
    </Card>
  );
}
