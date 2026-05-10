import { View, Text } from "react-native";
import { useProjectFiles } from "@/hooks/useProjectFiles";
import { VoiceNoteCard } from "./VoiceNoteCard";

interface VoiceNoteListProps {
  projectId: string;
  readOnly?: boolean;
}

/** All voice notes for a project. */
export function VoiceNoteList({ projectId, readOnly }: VoiceNoteListProps) {
  const { data, isLoading, error } = useProjectFiles({
    projectId,
    category: "voice-note",
  });

  if (isLoading) {
    return (
      <Text className="text-sm text-muted-foreground">Loading voice notes…</Text>
    );
  }
  if (error) {
    return (
      <Text className="text-sm text-danger-foreground" selectable>
        Could not load voice notes: {error.message}
      </Text>
    );
  }
  if (!data || data.length === 0) return null;

  return (
    <View className="gap-2" testID="voice-note-list">
      {data.map((file) => (
        <VoiceNoteCard key={file.id} file={file} readOnly={readOnly} />
      ))}
    </View>
  );
}
