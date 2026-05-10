/**
 * Voice note timeline row — renders as a variant in the note timeline.
 */
import { VoiceNoteCard } from "./voice-note-card";
import type { FileMetadata } from "@/infra/db-types";

type VoiceNoteRowProps = {
  file: FileMetadata;
  reportId?: string;
  authorName?: string;
  onDelete?: () => void;
};

export function VoiceNoteRow({ file, reportId, authorName, onDelete }: VoiceNoteRowProps) {
  return (
    <VoiceNoteCard
      file={file}
      reportId={reportId}
      authorName={authorName}
      onDelete={onDelete}
    />
  );
}
