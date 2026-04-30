import { useState } from "react";
import { View, Text, Pressable, ActivityIndicator, Alert } from "react-native";
import { Play, Pause, Mic, Trash2 } from "lucide-react-native";
import { useVoiceNotePlayer } from "@/hooks/useVoiceNotePlayer";
import { useDeleteFile } from "@/hooks/useProjectFiles";
import { Card } from "@/components/ui/Card";
import { type FileMetadataRow } from "@/lib/file-upload";

interface VoiceNoteCardProps {
  file: FileMetadataRow;
  /** Transcription text from the associated report_notes row. */
  transcription?: string | null;
  /** True while the transcript is still being generated for this file. */
  isTranscribing?: boolean;
  /** Hide the delete button (for read-only views). */
  readOnly?: boolean;
}

/**
 * Renders a single voice-note file: play/pause button, position indicator,
 * and the transcription text. Used both during report compose and read.
 */
export function VoiceNoteCard({
  file,
  transcription: transcriptionProp,
  isTranscribing,
  readOnly,
}: VoiceNoteCardProps) {
  const player = useVoiceNotePlayer(file.storage_path, file.duration_ms);
  const deleteFile = useDeleteFile();
  const [progressWidth, setProgressWidth] = useState(0);

  const onTogglePlay = () => {
    if (player.isPlaying) player.pause();
    else void player.play();
  };

  const durationMs = player.durationMs || file.duration_ms || 0;
  const progressRatio = durationMs > 0 ? Math.min(player.positionMs / durationMs, 1) : 0;
  const loadingLabel = player.isDownloading ? "Downloading" : player.isLoading ? "Loading" : null;

  const handleSeekPress = (event: { nativeEvent?: { locationX?: number } }) => {
    if (player.isLoading || durationMs <= 0 || progressWidth <= 0) return;
    const locationX = event.nativeEvent?.locationX ?? 0;
    const ratio = Math.min(Math.max(locationX / progressWidth, 0), 1);
    void player.seekTo(Math.round(durationMs * ratio));
  };

  const transcription = transcriptionProp?.trim() ?? "";
  const handleDelete = () => {
    Alert.alert(
      "Delete voice note",
      "Are you sure you want to delete this voice note? This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            deleteFile.mutate({
              fileId: file.id,
              storagePath: file.storage_path,
              projectId: file.project_id,
            });
          },
        },
      ],
    );
  };

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
            {loadingLabel ?? `${formatDuration(player.positionMs)} / ${formatDuration(durationMs)}`}
          </Text>
        </View>
        {!readOnly ? (
          <Pressable
            onPress={handleDelete}
            hitSlop={8}
            disabled={deleteFile.isPending}
            accessibilityLabel="Delete voice note"
            testID={`btn-voice-note-delete-${file.id}`}
            className="h-8 w-8 items-center justify-center rounded-md"
          >
            {deleteFile.isPending ? (
              <ActivityIndicator size="small" color="#1a1a2e" />
            ) : (
              <Trash2 size={16} color="#b91c1c" />
            )}
          </Pressable>
        ) : null}
      </View>
      <Pressable
        onPress={handleSeekPress}
        onLayout={(event) => setProgressWidth(event.nativeEvent.layout.width)}
        disabled={player.isLoading || durationMs <= 0}
        accessibilityRole="adjustable"
        accessibilityLabel="Voice note playback position"
        accessibilityValue={{
          min: 0,
          max: Math.round(durationMs / 1000),
          now: Math.round(player.positionMs / 1000),
        }}
        testID={`voice-note-progress-${file.id}`}
        className="h-5 justify-center"
      >
        <View className="h-1.5 overflow-hidden rounded-full bg-muted">
          <View
            className="h-full rounded-full bg-primary"
            style={{ width: `${progressRatio * 100}%` }}
          />
        </View>
      </Pressable>
      {isTranscribing ? (
        <View className="flex-row items-center gap-2">
          <ActivityIndicator size="small" color="#5c5c6e" />
          <Text className="text-xs italic text-muted-foreground">
            Transcribing…
          </Text>
        </View>
      ) : transcription ? (
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
