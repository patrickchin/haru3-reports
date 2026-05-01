import { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { Play, Pause, Trash2, Sparkles } from "lucide-react-native";
import { useVoiceNotePlayer } from "@/hooks/useVoiceNotePlayer";
import { useDeleteFile } from "@/hooks/useProjectFiles";
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard";
import {
  LONG_TRANSCRIPT_CHAR_THRESHOLD,
  useIsSummarizingFile,
  useSummarizeVoiceNote,
} from "@/hooks/useSummarizeVoiceNote";
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
  /**
   * Disable the auto-summarize-on-long-transcript behaviour. The "Summarize"
   * button still works. Tests use this to keep effects out of snapshots.
   */
  disableAutoSummarize?: boolean;
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
  disableAutoSummarize,
}: VoiceNoteCardProps) {
  const player = useVoiceNotePlayer(file.storage_path, file.duration_ms);
  const deleteFile = useDeleteFile();
  const { copy } = useCopyToClipboard();
  const summarize = useSummarizeVoiceNote();
  const isSummarizingFile = useIsSummarizingFile(file.id);

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
  const voiceTitle = file.voice_title?.trim() ?? "";
  const voiceSummary = file.voice_summary?.trim() ?? "";
  const isLongTranscript = transcription.length > LONG_TRANSCRIPT_CHAR_THRESHOLD;
  const hasSummary = voiceSummary.length > 0;
  const canSummarize = isLongTranscript && !hasSummary && !isTranscribing;

  // Auto-summarize once per mount when we have a long transcript without an
  // existing summary. Two layers of dedup:
  //   1. `hasTriggeredAutoSummarize` is per-instance — stops re-renders of
  //      THIS card from re-firing the mutation.
  //   2. `isSummarizingFile` queries the global TanStack mutation cache —
  //      stops sibling cards rendering the SAME file_id (e.g. compose tab +
  //      project list) from each firing their own duplicate call.
  // The edge function is also idempotent, so this is defence-in-depth.
  const hasTriggeredAutoSummarize = useRef(false);
  useEffect(() => {
    if (disableAutoSummarize) return;
    if (!canSummarize) return;
    if (hasTriggeredAutoSummarize.current) return;
    if (summarize.isPending) return;
    if (isSummarizingFile) return;
    hasTriggeredAutoSummarize.current = true;
    summarize.mutate({
      fileId: file.id,
      transcript: transcription,
      projectId: file.project_id,
    });
    // Auto-summarize fires once per mount. Manual retries go through
    // handleManualSummarize. The mutation object is stable across renders
    // so excluding it doesn't risk a stale closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    canSummarize,
    disableAutoSummarize,
    file.id,
    file.project_id,
    isSummarizingFile,
    transcription,
  ]);

  const handleManualSummarize = () => {
    if (summarize.isPending || !transcription) return;
    hasTriggeredAutoSummarize.current = true;
    summarize.mutate({
      fileId: file.id,
      transcript: transcription,
      projectId: file.project_id,
    });
  };

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
      {voiceTitle ? (
        <Text
          className="text-base font-semibold text-foreground"
          numberOfLines={2}
          testID={`voice-note-title-${file.id}`}
        >
          {voiceTitle}
        </Text>
      ) : null}
      {hasSummary ? (
        <View testID={`voice-note-summary-${file.id}`}>
          <Text className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Summary
          </Text>
          <Text className="text-sm text-foreground">{voiceSummary}</Text>
        </View>
      ) : null}
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
          {hasSummary ? (
            <Text className="text-xs text-muted-foreground">
              {isTranscriptExpanded ? "Hide full transcript" : "Show full transcript"}
            </Text>
          ) : null}
          {!hasSummary || isTranscriptExpanded ? (
            <Text
              className="text-sm text-foreground"
              numberOfLines={isTranscriptExpanded ? undefined : 3}
              ellipsizeMode="tail"
            >
              {transcription}
            </Text>
          ) : null}
        </Pressable>
      ) : (
        <Text className="text-xs italic text-muted-foreground">
          (no transcription yet)
        </Text>
      )}
      {summarize.isPending ? (
        <View className="flex-row items-center gap-2">
          <ActivityIndicator size="small" color={colors.muted.foreground} />
          <Text className="text-xs italic text-muted-foreground">
            Summarizing…
          </Text>
        </View>
      ) : canSummarize ? (
        <Pressable
          onPress={handleManualSummarize}
          accessibilityRole="button"
          accessibilityLabel="Summarize voice note"
          testID={`btn-voice-note-summarize-${file.id}`}
          className="flex-row items-center gap-1 self-start rounded-md px-1 py-0.5"
        >
          <Sparkles size={12} color={colors.primary.DEFAULT} />
          <Text className="text-xs font-medium text-primary">Summarize</Text>
        </Pressable>
      ) : null}
      {summarize.isError ? (
        <View className="flex-row items-center gap-2">
          <Text
            className="flex-1 text-xs text-danger-foreground"
            selectable
            testID={`voice-note-summary-error-${file.id}`}
          >
            {summarize.error?.message ?? "Could not summarize"}
          </Text>
          <Pressable
            onPress={handleManualSummarize}
            accessibilityRole="button"
            accessibilityLabel="Retry summarize"
          >
            <Text className="text-xs font-medium text-primary">Retry</Text>
          </Pressable>
        </View>
      ) : null}
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
