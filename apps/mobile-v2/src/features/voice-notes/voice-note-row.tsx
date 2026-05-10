/**
 * Voice note timeline row — renders as a variant in the note timeline.
 */
import { VoiceNoteCard } from "./voice-note-card";
import type { FileMetadata } from "@/infra/db-types";

type VoiceNoteRowProps = {
  file: FileMetadata;
  authorName?: string;
  onDelete?: () => void;
};

export function VoiceNoteRow({ file, authorName, onDelete }: VoiceNoteRowProps) {
  return <VoiceNoteCard file={file} authorName={authorName} onDelete={onDelete} />;
}
