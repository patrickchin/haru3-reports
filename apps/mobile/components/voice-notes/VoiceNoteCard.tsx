import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { Play, Pause, Mic } from "lucide-react-native";
import { useVoiceNotePlayer } from "@/hooks/useVoiceNotePlayer";
import { useDeleteFile } from "@/hooks/useProjectFiles";
import { Card } from "@/components/ui/Card";
import { type FileMetadataRow } from "@/lib/file-upload";

interface VoiceNoteCardProps {
  file: FileMetadataRow;
  /** Transcription text from the associated report_notes row. */
  transcription?: string | null;
  /** Hide the delete button (for read-only views). */
  readOnly?: boolean;
}

/**
 * Renders a single voice-note file: play/pause button, position indicator,
 * and the transcription text. Used both during report compose and read.
 */
export function VoiceNoteCard({ file, transcription: transcriptionProp, readOnly }: VoiceNoteCardProps) {
  const player = useVoiceNotePlayer(file.storage_path, file.duration_ms);
  const deleteFile = useDeleteFile();

  const onTogglePlay = () => {
    if (player.isPlaying) player.pause();
    else void player.play();
  };

  const transcription = transcriptionProp?.trim() ?? "";

  return (
    <Card className="gap-2 p-3" testID={`voice-note-card-${file.id}`}>
      <View className="flex-row items-center gap-3">
        <Pressable
          onPress={onTogglePlay}
          disabled={player.isLoading}
          accessibilityLabel={
            player.isPlaying ? "Pause voice note" : "Play voice note"
          }
          testID={`btn-voice-note-play-${file.id}`}
          className="h-10 w-10 items-center justify-center rounded-full bg-primary"
        >
          {player.isLoading ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : player.isPlaying ? (
            <Pause size={18} color="#ffffff" />
          ) : (
            <Play size={18} color="#ffffff" />
          )}
        </Pressable>
        <View className="flex-1">
          <View className="flex-row items-center gap-2">
            <Mic size={14} color="#52525b" />
            <Text className="text-xs uppercase text-muted-foreground">
              Voice note
            </Text>
          </View>
          <Text className="text-xs text-muted-foreground">
            {formatDuration(player.positionMs)} /{" "}
            {formatDuration(player.durationMs || file.duration_ms || 0)}
          </Text>
        </View>
        {!readOnly ? (
          <Pressable
            onPress={() => {
              deleteFile.mutate({
                fileId: file.id,
                storagePath: file.storage_path,
                projectId: file.project_id,
              });
            }}
            disabled={deleteFile.isPending}
            accessibilityLabel="Delete voice note"
            testID={`btn-voice-note-delete-${file.id}`}
            className="h-8 px-2 items-center justify-center"
          >
            <Text className="text-xs font-semibold text-danger-foreground">
              Delete
            </Text>
          </Pressable>
        ) : null}
      </View>
      {transcription ? (
        <Text className="text-sm text-foreground">{transcription}</Text>
      ) : (
        <Text className="text-xs italic text-muted-foreground">
          (no transcription yet)
        </Text>
      )}
      {player.error ? (
        <Text className="text-xs text-danger-foreground" selectable>{player.error}</Text>
      ) : null}
    </Card>
  );
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
