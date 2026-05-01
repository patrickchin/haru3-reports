import { useEffect, useState } from "react";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { Play, Pause, Trash2 } from "lucide-react-native";
import { useVoiceNotePlayer } from "@/hooks/useVoiceNotePlayer";
import { useDeleteFile } from "@/hooks/useProjectFiles";
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard";
import { AppDialogSheet } from "@/components/ui/AppDialogSheet";
import { getDeleteVoiceNoteDialogCopy } from "@/lib/app-dialog-copy";
import { Card } from "@/components/ui/Card";
import { type FileMetadataRow } from "@/lib/file-upload";
import { colors } from "@/lib/design-tokens/colors";

interface VoiceNoteCardProps {
  file: FileMetadataRow;
  /** Transcription text from the associated report_notes row. */
  transcription?: string | null;
  /** True while the transcript is still being generated for this file. */
  isTranscribing?: boolean;
  /** Hide the delete button (for read-only views). */
  readOnly?: boolean;
  /** Display name of the person who recorded this voice note. */
  authorName?: string | null;
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
  authorName,
}: VoiceNoteCardProps) {
  const player = useVoiceNotePlayer(file.storage_path, {
    file,
    authorName: authorName ?? null,
    fallbackDurationMs: file.duration_ms,
  });
  const deleteFile = useDeleteFile();
  const { copy } = useCopyToClipboard();

  // Eagerly download the audio file to disk cache on mount so tapping
  // Play starts instantly from local bytes instead of waiting for a
  // signed-URL fetch + download.
  useEffect(() => {
    void player.preload();
    // Only run once on mount — storagePath is stable for a given card.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [progressWidth, setProgressWidth] = useState(0);
  const [isTranscriptExpanded, setIsTranscriptExpanded] = useState(false);
  const [isDeleteDialogVisible, setIsDeleteDialogVisible] = useState(false);
  const deleteDialogCopy = getDeleteVoiceNoteDialogCopy();
  const shortId = file.id.slice(0, 8);

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
    setIsDeleteDialogVisible(true);
  };
  const handleConfirmDelete = () => {
    setIsDeleteDialogVisible(false);
    deleteFile.mutate({
      fileId: file.id,
      storagePath: file.storage_path,
      projectId: file.project_id,
    });
  };

  return (
    <Card className="gap-2 p-3" testID={`voice-note-card-${file.id}`}>
      <View className="flex-row items-center justify-between">
        {authorName ? (
          <Text className="text-xs font-medium text-muted-foreground">{authorName}</Text>
        ) : (
          <View />
        )}
        <Pressable
          onPress={() => copy(file.id, { toast: "Note id copied" })}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={`Copy voice note id ${file.id}`}
          testID={`voice-note-id-${file.id}`}
        >
          <Text className="text-[10px] font-mono text-muted-foreground" selectable>
            id: {shortId}
          </Text>
        </Pressable>
      </View>
      <View className="flex-row items-center gap-2">
        <Pressable
          onPress={onTogglePlay}
          disabled={player.isLoading}
          accessibilityLabel={
            player.isPlaying ? "Pause voice note" : "Play voice note"
          }
          testID={`btn-voice-note-play-${file.id}`}
          className="h-8 w-8 items-center justify-center rounded-full bg-primary"
        >
          {player.isLoading ? (
            <ActivityIndicator size="small" color={colors.primary.foreground} />
          ) : player.isPlaying ? (
            <Pause size={14} color={colors.primary.foreground} />
          ) : (
            <Play size={14} color={colors.primary.foreground} />
          )}
        </Pressable>
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
          className="h-5 min-w-0 flex-1 justify-center"
        >
          <View className="h-1.5 overflow-hidden rounded-full bg-muted">
            <View
              className="h-full rounded-full bg-primary"
              style={{ width: `${progressRatio * 100}%` }}
            />
          </View>
        </Pressable>
        <Text className="w-[70px] text-right text-xs text-muted-foreground">
          {loadingLabel ?? `${formatDuration(player.positionMs)} / ${formatDuration(durationMs)}`}
        </Text>
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
              <ActivityIndicator size="small" color={colors.foreground} />
            ) : (
              <Trash2 size={16} color={colors.danger.DEFAULT} />
            )}
          </Pressable>
        ) : null}
      </View>
      {isTranscribing ? (
        <View className="flex-row items-center gap-2">
          <ActivityIndicator size="small" color={colors.muted.foreground} />
          <Text className="text-xs italic text-muted-foreground">
            Transcribing…
          </Text>
        </View>
      ) : transcription ? (
        <Pressable
          testID={`voice-note-transcript-${file.id}`}
          onPress={() => setIsTranscriptExpanded((expanded) => !expanded)}
          accessibilityRole="button"
          accessibilityLabel={isTranscriptExpanded ? "Collapse transcript" : "Expand transcript"}
          accessibilityState={{ expanded: isTranscriptExpanded }}
        >
          <Text
            className="text-sm text-foreground"
            numberOfLines={isTranscriptExpanded ? undefined : 3}
            ellipsizeMode="tail"
          >
            {transcription}
          </Text>
        </Pressable>
      ) : (
        <Text className="text-xs italic text-muted-foreground">
          (no transcription yet)
        </Text>
      )}
      {player.error ? (
        <Text className="text-xs text-danger-foreground" selectable>{player.error}</Text>
      ) : null}
      <AppDialogSheet
        visible={isDeleteDialogVisible}
        title={deleteDialogCopy.title}
        message={deleteDialogCopy.message}
        noticeTone={deleteDialogCopy.tone}
        noticeTitle={deleteDialogCopy.noticeTitle}
        onClose={() => setIsDeleteDialogVisible(false)}
        actions={[
          {
            label: deleteDialogCopy.confirmLabel,
            variant: deleteDialogCopy.confirmVariant,
            onPress: handleConfirmDelete,
          },
          {
            label: deleteDialogCopy.cancelLabel ?? "Cancel",
            variant: "secondary",
            onPress: () => setIsDeleteDialogVisible(false),
          },
        ]}
      />
    </Card>
  );
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
