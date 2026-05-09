import { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, ActivityIndicator, ScrollView } from "react-native";
import { Play, Pause, MoreVertical, Sparkles } from "lucide-react-native";
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
import { formatCapturedAt } from "@/lib/format-date";
import { shareVoiceNote } from "@/lib/voice-note-share";

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
   * ISO timestamp to display in the card header. Should be the
   * `report_notes.created_at` for the note row that links this file to
   * the report — *not* the file's own `created_at`. Falls back to
   * `file.created_at` when null/undefined so legacy callers keep working.
   */
  capturedAt?: string | null;
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
  capturedAt,
  disableAutoSummarize,
}: VoiceNoteCardProps) {
  const player = useVoiceNotePlayer(file.storage_path, {
    file,
    authorName: authorName ?? null,
    fallbackDurationMs: file.duration_ms,
  });
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
  const [isOptionsDialogVisible, setIsOptionsDialogVisible] = useState(false);
  const [isTranscriptDialogVisible, setIsTranscriptDialogVisible] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [isShareBusy, setIsShareBusy] = useState(false);
  const deleteDialogCopy = getDeleteVoiceNoteDialogCopy();

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

  const handleConfirmDelete = () => {
    setIsDeleteDialogVisible(false);
    deleteFile.mutate({
      fileId: file.id,
      storagePath: file.storage_path,
      projectId: file.project_id,
    });
  };

  const closeOptionsDialog = () => {
    setIsOptionsDialogVisible(false);
    setShareError(null);
  };

  const handleOpenOptions = () => {
    setShareError(null);
    setIsOptionsDialogVisible(true);
  };

  const handleShareIntent = async (intent: "share" | "download") => {
    if (isShareBusy) return;
    setShareError(null);
    setIsShareBusy(true);
    try {
      // Make sure the audio is in the disk cache before handing it off
      // to the system share sheet — preload is idempotent and a no-op if
      // the file is already cached.
      await player.preload();
      await shareVoiceNote({
        storagePath: file.storage_path,
        mimeType: file.mime_type,
        intent,
      });
      setIsOptionsDialogVisible(false);
    } catch (err) {
      setShareError(
        err instanceof Error ? err.message : "Could not share the voice note.",
      );
    } finally {
      setIsShareBusy(false);
    }
  };

  const handleCopyValue = (
    value: string | null | undefined,
    toast: string,
  ) => {
    const trimmed = value?.trim() ?? "";
    if (!trimmed) return;
    void copy(trimmed, { toast });
  };

  const handleDeleteFromOptions = () => {
    setIsOptionsDialogVisible(false);
    setIsDeleteDialogVisible(true);
  };

  const handleViewTranscript = () => {
    setIsOptionsDialogVisible(false);
    setIsTranscriptDialogVisible(true);
  };

  const headerTimestamp = capturedAt ?? file.created_at;

  // Header layout matches the text-note row in NoteTimeline so both kinds
  // of notes line up identically: author on the left, short id + captured-
  // at on the right, all in muted 10px text.
  return (
    <Card className="gap-2 p-3" testID={`voice-note-card-${file.id}`}>
      <View className="flex-row items-center justify-between gap-2">
        <Text
          className="flex-1 text-[10px] font-medium text-muted-foreground"
          numberOfLines={1}
        >
          {authorName ?? "Unknown author"}
        </Text>
        {headerTimestamp ? (
          <Text
            className="text-[10px] text-muted-foreground"
            numberOfLines={1}
            testID={`voice-note-captured-at-${file.id}`}
          >
            {formatCapturedAt(headerTimestamp)}
          </Text>
        ) : null}
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
        <Text
          className="text-sm text-foreground"
          testID={`voice-note-summary-${file.id}`}
        >
          {voiceSummary}
        </Text>
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
        <Pressable
          onPress={handleOpenOptions}
          hitSlop={8}
          disabled={deleteFile.isPending}
          accessibilityLabel="Voice note options"
          testID={`btn-voice-note-options-${file.id}`}
          className="h-8 w-8 items-center justify-center rounded-md"
        >
          {deleteFile.isPending ? (
            <ActivityIndicator size="small" color={colors.foreground} />
          ) : (
            <MoreVertical size={18} color={colors.muted.foreground} />
          )}
        </Pressable>
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
          onLongPress={() => copy(transcription, { toast: "Transcript copied" })}
          accessibilityRole="button"
          accessibilityLabel={isTranscriptExpanded ? "Hide full transcript" : "Show full transcript"}
          accessibilityHint="Long press to copy transcript"
          accessibilityState={{ expanded: isTranscriptExpanded }}
        >
          {isTranscriptExpanded ? (
            <>
              <Text
                className={
                  hasSummary
                    ? "text-xs text-muted-foreground"
                    : "text-sm text-foreground"
                }
              >
                {transcription}
              </Text>
              <Text className="mt-1 text-xs font-medium text-primary">
                Hide transcript
              </Text>
            </>
          ) : (
            <Text className="text-xs font-medium text-primary">
              Show full transcript
            </Text>
          )}
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
      <AppDialogSheet
        visible={isOptionsDialogVisible}
        title="Voice note options"
        onClose={closeOptionsDialog}
        actions={[
          {
            label: "View transcript",
            variant: "secondary",
            disabled: !transcription,
            onPress: handleViewTranscript,
            testID: `dialog-action-voice-note-view-transcript-${file.id}`,
          },
          {
            label: isShareBusy ? "Preparing…" : "Download",
            variant: "secondary",
            disabled: isShareBusy,
            onPress: () => {
              void handleShareIntent("download");
            },
            testID: `dialog-action-voice-note-download-${file.id}`,
          },
          {
            label: isShareBusy ? "Preparing…" : "Share",
            variant: "secondary",
            disabled: isShareBusy,
            onPress: () => {
              void handleShareIntent("share");
            },
            testID: `dialog-action-voice-note-share-${file.id}`,
          },
          ...(readOnly
            ? []
            : [
                {
                  label: "Delete",
                  variant: "destructive" as const,
                  disabled: deleteFile.isPending,
                  onPress: handleDeleteFromOptions,
                  testID: `dialog-action-voice-note-delete-${file.id}`,
                },
              ]),
        ]}
      >
        <View
          className="gap-2 rounded-md bg-muted/40 p-3"
          testID={`voice-note-options-meta-${file.id}`}
        >
          {voiceTitle ? (
            <Pressable
              onPress={() => handleCopyValue(voiceTitle, "Title copied")}
              accessibilityRole="button"
              accessibilityLabel="Copy title"
              testID={`voice-note-options-title-${file.id}`}
            >
              <Text
                className="text-base font-semibold text-foreground"
                numberOfLines={2}
              >
                {voiceTitle}
              </Text>
            </Pressable>
          ) : null}
          {voiceSummary ? (
            <MetaRow
              label="Summary"
              value={voiceSummary}
              onPress={() => handleCopyValue(voiceSummary, "Summary copied")}
              accessibilityLabel="Copy summary"
              testID={`voice-note-options-summary-${file.id}`}
            />
          ) : null}
          <MetaRow
            label="Author"
            value={authorName ?? "Unknown author"}
            onPress={
              authorName
                ? () => handleCopyValue(authorName, "Author copied")
                : undefined
            }
            accessibilityLabel={authorName ? "Copy author" : undefined}
            testID={`voice-note-options-author-${file.id}`}
          />
          <MetaRow
            label="ID"
            value={file.id}
            onPress={() => handleCopyValue(file.id, "Note id copied")}
            accessibilityLabel="Copy id"
            testID={`voice-note-options-id-${file.id}`}
          />
          <MetaRow
            label="Recorded"
            value={formatCapturedAt(headerTimestamp) || "—"}
          />
          <MetaRow
            label="Duration"
            value={durationMs > 0 ? formatDuration(durationMs) : "—"}
          />
          {file.mime_type ? (
            <MetaRow label="Format" value={file.mime_type} />
          ) : null}
          {typeof file.size_bytes === "number" && file.size_bytes > 0 ? (
            <MetaRow label="Size" value={formatBytes(file.size_bytes)} />
          ) : null}
          <Text className="mt-1 text-[10px] italic text-muted-foreground">
            Tap a row to copy.
          </Text>
        </View>
        {shareError ? (
          <Text
            className="mt-2 text-xs text-danger-foreground"
            selectable
            testID={`voice-note-options-error-${file.id}`}
          >
            {shareError}
          </Text>
        ) : null}
      </AppDialogSheet>
      <AppDialogSheet
        visible={isTranscriptDialogVisible}
        title="Transcript"
        onClose={() => setIsTranscriptDialogVisible(false)}
        actions={[
          {
            label: "Copy transcript",
            variant: "secondary",
            disabled: !transcription,
            onPress: () => {
              handleCopyValue(transcription, "Transcript copied");
              setIsTranscriptDialogVisible(false);
            },
            testID: `dialog-action-voice-note-transcript-copy-${file.id}`,
          },
          {
            label: "Close",
            variant: "quiet",
            onPress: () => setIsTranscriptDialogVisible(false),
            testID: `dialog-action-voice-note-transcript-close-${file.id}`,
          },
        ]}
      >
        <View
          className="max-h-[60vh] rounded-md bg-muted/40 p-3"
          testID={`voice-note-transcript-modal-${file.id}`}
        >
          <ScrollView showsVerticalScrollIndicator>
            <Text className="text-sm text-foreground" selectable>
              {transcription || "(no transcription yet)"}
            </Text>
          </ScrollView>
        </View>
      </AppDialogSheet>
    </Card>
  );
}

function MetaRow({
  label,
  value,
  selectable,
  onPress,
  accessibilityLabel,
  testID,
}: {
  label: string;
  value: string;
  selectable?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
  testID?: string;
}) {
  const content = (
    <View className="flex-row gap-2">
      <Text className="w-20 text-xs font-medium text-muted-foreground">
        {label}
      </Text>
      <Text
        className="flex-1 text-xs text-foreground"
        selectable={selectable}
      >
        {value}
      </Text>
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
    >
      {content}
    </Pressable>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
