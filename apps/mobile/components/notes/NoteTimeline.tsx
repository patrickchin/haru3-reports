import { View, Text, Pressable, Image, ActivityIndicator } from "react-native";
import { Trash2, AlertCircle, Mic } from "lucide-react-native";
import Animated, { FadeInDown, LinearTransition } from "react-native-reanimated";
import { VoiceNoteCard } from "@/components/voice-notes/VoiceNoteCard";
import { FileCard } from "@/components/files/FileCard";
import type {
  TimelineItem,
  PendingPhotoItem,
  PendingVoiceItem,
} from "@/hooks/useNoteTimeline";
import type { FileMetadataRow } from "@/lib/file-upload";
import { colors } from "@/lib/design-tokens/colors";
import { formatCapturedAt } from "@/lib/format-date";

const TIMELINE_ROW_LAYOUT = LinearTransition.duration(180);
const TIMELINE_ROW_ENTRY = FadeInDown.duration(140);

interface NoteTimelineProps {
  timeline: readonly TimelineItem[];
  isLoading?: boolean;
  error?: Error | null;
  onRemoveNote?: (sourceIndex: number) => void;
  onOpenFile?: (file: FileMetadataRow) => void;
  /** Transcripts keyed by `file_metadata.id` for voice notes. Looked up
   *  by `VoiceNoteCard` to render the transcribed body beneath each
   *  voice-note row. */
  transcriptionsByFileId?: ReadonlyMap<string, string>;
  /** Voice-note file ids whose transcript is still being generated. */
  transcribingFileIds?: ReadonlySet<string>;
  /** Map of user_id → display name, used to show the author on voice notes. */
  memberNames?: ReadonlyMap<string, string>;
  /** Map of `file_metadata.id` → the linked `report_notes.created_at`,
   *  used as the visible timestamp on voice + photo cards. Falls back
   *  to `file.created_at` when missing. */
  noteCreatedAtByFileId?: ReadonlyMap<string, string>;
  /** Map of `file_metadata.id` → `report_notes.author_id`, used to look
   *  up the photo card's author display name from `memberNames`. */
  noteAuthorByFileId?: ReadonlyMap<string, string>;
  readOnly?: boolean;
  /** Retry handler for a failed pending photo upload. */
  onRetryPendingPhoto?: (localId: string) => void;
  /** Discard handler for a pending photo (failed or in-flight). */
  onDiscardPendingPhoto?: (localId: string) => void;
  /** Retry handler for a failed pending voice note (upload or transcription). */
  onRetryPendingVoice?: (localId: string) => void;
  /** Discard handler for a pending voice note. */
  onDiscardPendingVoice?: (localId: string) => void;
}

/**
 * Renders a chronologically-sorted list of text notes, voice notes, photos,
 * and documents as a single interleaved timeline.
 */
export function NoteTimeline({
  timeline,
  isLoading,
  error,
  onRemoveNote,
  onOpenFile,
  transcriptionsByFileId,
  transcribingFileIds,
  memberNames,
  noteCreatedAtByFileId,
  noteAuthorByFileId,
  readOnly,
  onRetryPendingPhoto,
  onDiscardPendingPhoto,
  onRetryPendingVoice,
  onDiscardPendingVoice,
}: NoteTimelineProps) {
  if (isLoading) {
    return (
      <Text className="text-sm text-muted-foreground">Loading…</Text>
    );
  }

  if (error) {
    return (
      <Text className="text-sm text-danger-foreground" selectable>
        Could not load notes: {error.message}
      </Text>
    );
  }

  if (timeline.length === 0) return null;

  return (
    <View className="gap-2" testID="note-timeline">
      {timeline.map((item) => {
        if (item.kind === "file") {
          if (item.file.category === "voice-note") {
            // When this file row originated as an optimistic pending
            // voice note, key by the pending entry's localId so the
            // outer Animated.View is the same instance that wrapped the
            // PendingVoiceCard moments earlier. The inner card type
            // still changes (PendingVoiceCard → VoiceNoteCard), but the
            // wrapping row no longer unmounts — the layout transition
            // smoothly resizes it instead of dropping + re-inserting.
            const voiceKey = `voice-${item.voiceStableKey ?? item.file.id}`;
            return (
              <Animated.View
                key={voiceKey}
                layout={TIMELINE_ROW_LAYOUT}
                entering={TIMELINE_ROW_ENTRY}
              >
                <VoiceNoteCard
                  file={item.file}
                  transcription={transcriptionsByFileId?.get(item.file.id) ?? null}
                  isTranscribing={transcribingFileIds?.has(item.file.id) ?? false}
                  authorName={memberNames?.get(item.file.uploaded_by) ?? null}
                  capturedAt={noteCreatedAtByFileId?.get(item.file.id) ?? null}
                  readOnly={readOnly}
                />
              </Animated.View>
            );
          }
          return (
            <Animated.View
              key={
                item.photoStableKey
                  ? `photo-${item.photoStableKey}`
                  : `file-${item.file.id}`
              }
              layout={TIMELINE_ROW_LAYOUT}
              entering={TIMELINE_ROW_ENTRY}
            >
              <FileCard
                file={item.file}
                onOpen={onOpenFile}
                authorName={
                  noteAuthorByFileId?.get(item.file.id)
                    ? (memberNames?.get(
                        noteAuthorByFileId.get(item.file.id) as string,
                      ) ?? null)
                    : (memberNames?.get(item.file.uploaded_by) ?? null)
                }
                capturedAt={noteCreatedAtByFileId?.get(item.file.id) ?? null}
                readOnly={readOnly}
              />
            </Animated.View>
          );
        }

        if (item.kind === "pending-photo") {
          // Same key scheme as the post-upload photo file row above
          // (`photo-${localId}`) so the swap from PendingMediaCard →
          // FileCard reuses this Animated.View instance and the row
          // morphs in place instead of unmounting + remounting (which
          // would visibly shift everything below it). The inner
          // testID `pending-photo-${localId}` is preserved for Maestro.
          return (
            <Animated.View
              key={`photo-${item.pending.localId}`}
              layout={TIMELINE_ROW_LAYOUT}
              entering={TIMELINE_ROW_ENTRY}
            >
              <PendingMediaCard
                kind="photo"
                pending={item.pending}
                onRetry={onRetryPendingPhoto}
                onDiscard={onDiscardPendingPhoto}
              />
            </Animated.View>
          );
        }

        if (item.kind === "pending-voice") {
          // Key by the same `voice-${localId}` scheme used for the
          // post-upload file row above so the swap reuses this
          // Animated.View instance and the row morphs in place.
          return (
            <Animated.View
              key={`voice-${item.pending.localId}`}
              layout={TIMELINE_ROW_LAYOUT}
              entering={TIMELINE_ROW_ENTRY}
            >
              <PendingMediaCard
                kind="voice"
                pending={item.pending}
                onRetry={onRetryPendingVoice}
                onDiscard={onDiscardPendingVoice}
              />
            </Animated.View>
          );
        }

        // Text note
        const authorName = getTextNoteAuthorName(item.entry.authorId, memberNames);
        const noteId = getShortNoteId(item.entry.id);
        return (
          <Animated.View
            key={`note-${item.entry.id ?? item.sourceIndex}`}
            layout={TIMELINE_ROW_LAYOUT}
            entering={TIMELINE_ROW_ENTRY}
          >
            <View className="gap-1.5 rounded-lg border border-border bg-card p-3">
              <View className="flex-row items-center justify-between gap-2">
                <Text
                  className="flex-1 text-[10px] font-medium text-muted-foreground"
                  numberOfLines={1}
                  testID={`text-note-author-${item.sourceIndex}`}
                >
                  {authorName}
                </Text>
                <View className="flex-row items-center gap-2">
                  {noteId ? (
                    <Text
                      className="text-[10px] text-muted-foreground"
                      numberOfLines={1}
                      testID={`text-note-id-${item.sourceIndex}`}
                    >
                      {noteId}
                    </Text>
                  ) : null}
                  <Text
                    className="text-[10px] text-muted-foreground"
                    numberOfLines={1}
                    testID={`text-note-captured-at-${item.sourceIndex}`}
                  >
                    {formatCapturedAt(item.entry.addedAt)}
                  </Text>
                </View>
              </View>
              <View className="flex-row items-start gap-2">
                <Text className="flex-1 text-body text-foreground">
                  {item.entry.text}
                </Text>
                {!item.entry.isPending && !readOnly && onRemoveNote && (
                  <Pressable
                    onPress={() => onRemoveNote(item.sourceIndex)}
                    hitSlop={8}
                    className="h-7 w-7 items-center justify-center rounded-md"
                    accessibilityLabel="Delete note"
                  >
                    <Trash2 size={16} color={colors.danger.DEFAULT} />
                  </Pressable>
                )}
              </View>
            </View>
          </Animated.View>
        );
      })}
    </View>
  );
}

/**
 * Optimistic media card shown while a photo or voice note is uploading
 * (and, for voice, being transcribed). Renders identical chrome for both
 * media kinds — only the leading thumbnail and status copy differ. On
 * failure the card dims, shows a destructive status line, and surfaces
 * inline Retry / Discard actions anchored to this row.
 *
 * Note: this is intentionally separate from the "ready" `FileCard` /
 * `VoiceNoteCard` — those carry full file metadata, signed-URL fetching,
 * delete dialogs, audio playback, and transcript / summarize logic. The
 * pending card is a lightweight placeholder used only until upload
 * completes; merging the two would require branching all of that
 * machinery on a `pending` flag and would balloon both files.
 */
function PendingMediaCard(
  props:
    | {
        kind: "photo";
        pending: PendingPhotoItem;
        onRetry?: (localId: string) => void;
        onDiscard?: (localId: string) => void;
      }
    | {
        kind: "voice";
        pending: PendingVoiceItem;
        onRetry?: (localId: string) => void;
        onDiscard?: (localId: string) => void;
      },
) {
  const { kind, pending, onRetry, onDiscard } = props;
  const failed = pending.status === "failed";
  const isPhoto = kind === "photo";
  const labelNoun = isPhoto ? "photo" : "voice note";
  const testIDPrefix = isPhoto ? "pending-photo" : "pending-voice";

  const statusLabel = isPhoto
    ? failed
      ? "Upload failed"
      : "Uploading…"
    : pending.status === "uploading"
      ? "Uploading audio…"
      : pending.status === "transcribing"
        ? "Transcribing…"
        : "Voice note failed";

  return (
    <View
      testID={`${testIDPrefix}-${pending.localId}`}
      className={
        "gap-2 rounded-lg border bg-card p-3 " +
        (failed ? "border-danger-border" : "border-border")
      }
      style={failed ? { opacity: 0.6 } : undefined}
    >
      <Text className="text-[10px] text-muted-foreground">
        {formatCapturedAt(pending.addedAt)}
      </Text>
      <View className="flex-row items-start gap-3">
        {isPhoto ? (
          <Image
            source={{ uri: pending.thumbnailUri }}
            style={{ width: 64, height: 64, borderRadius: 6 }}
            accessibilityLabel="Uploading photo"
          />
        ) : (
          <View className="h-10 w-10 items-center justify-center rounded-md bg-secondary">
            <Mic size={18} color={colors.muted.foreground} />
          </View>
        )}
        <View className="flex-1 gap-1">
          <View className="flex-row items-center gap-1.5">
            {failed ? (
              <AlertCircle size={14} color={colors.danger.DEFAULT} />
            ) : (
              <ActivityIndicator size="small" color={colors.muted.foreground} />
            )}
            <Text
              className={
                failed
                  ? "text-xs font-medium text-danger-foreground"
                  : "text-xs text-muted-foreground"
              }
            >
              {statusLabel}
            </Text>
          </View>
          {!isPhoto && pending.durationMs != null && (
            <Text className="text-[11px] text-muted-foreground">
              {formatDurationMs(pending.durationMs)}
            </Text>
          )}
          {failed && pending.error ? (
            <Text
              className="text-[11px] text-muted-foreground"
              numberOfLines={2}
              selectable
            >
              {pending.error}
            </Text>
          ) : null}
        </View>
      </View>
      {failed && (onRetry || onDiscard) && (
        <View className="flex-row justify-end gap-2 pt-1">
          {onDiscard && (
            <Pressable
              onPress={() => onDiscard(pending.localId)}
              hitSlop={6}
              className="h-7 items-center justify-center rounded-md px-3"
              accessibilityLabel={`Discard ${labelNoun}`}
              testID={`${testIDPrefix}-discard-${pending.localId}`}
            >
              <Text className="text-xs font-medium text-muted-foreground">
                Discard
              </Text>
            </Pressable>
          )}
          {onRetry && (
            <Pressable
              onPress={() => onRetry(pending.localId)}
              hitSlop={6}
              className="h-7 items-center justify-center rounded-md bg-secondary px-3"
              accessibilityLabel={
                isPhoto ? "Retry photo upload" : "Retry voice note"
              }
              testID={`${testIDPrefix}-retry-${pending.localId}`}
            >
              <Text className="text-xs font-semibold text-foreground">
                Retry
              </Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

function formatDurationMs(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function getTextNoteAuthorName(
  authorId: string | undefined,
  memberNames: ReadonlyMap<string, string> | undefined,
): string {
  if (!authorId) return "Unknown author";
  return memberNames?.get(authorId) ?? authorId;
}

function getShortNoteId(id: string | undefined): string | null {
  if (!id) return null;
  return id.slice(0, 8);
}
