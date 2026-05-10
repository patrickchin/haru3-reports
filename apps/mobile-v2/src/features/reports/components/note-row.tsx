/**
 * Single note row component.
 *
 * Handles both text notes and voice notes (renders VoiceNoteRow for voice).
 */
import { Text, View, Pressable } from "react-native";
import { Trash2 } from "lucide-react-native";
import type { ReportNote, FileMetadata } from "@/infra/db-types";
import { Card } from "@/shared/components/Card";
import { VoiceNoteRow } from "@/features/voice-notes";

type NoteRowProps = {
  note: ReportNote;
  file?: FileMetadata; // For voice notes
  reportId?: string;
  onDelete: (noteId: string) => void;
};

export function NoteRow({ note, file, reportId, onDelete }: NoteRowProps) {
  // Voice notes are rendered via VoiceNoteRow
  if (note.kind === "voice" && file) {
    return (
      <VoiceNoteRow
        file={file}
        reportId={reportId}
        onDelete={() => onDelete(note.id)}
      />
    );
  }

  // Text note
  return (
    <Card className="mb-3">
      <View className="flex-row justify-between items-start">
        <View className="flex-1">
          <Text className="text-sm text-gray-700">{note.body || "(Empty note)"}</Text>
          <Text className="text-xs text-gray-500 mt-1">
            {new Date(note.created_at).toLocaleString()}
          </Text>
        </View>
        <Pressable onPress={() => onDelete(note.id)} className="ml-3">
          <Trash2 size={18} color="#dc2626" />
        </Pressable>
      </View>
    </Card>
  );
}
