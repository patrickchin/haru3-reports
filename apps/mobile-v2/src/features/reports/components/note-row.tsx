/**
 * Single note row component.
 *
 * Text variant only for Phase 0. Props exposed for file/voice variants
 * so other waves can extend.
 */
import { Text, View, Pressable } from "react-native";
import { Trash2 } from "lucide-react-native";
import type { ReportNote } from "@/infra/db-types";
import { Card } from "@/shared/components/Card";

type NoteRowProps = {
  note: ReportNote;
  onDelete: (noteId: string) => void;
};

export function NoteRow({ note, onDelete }: NoteRowProps) {
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
