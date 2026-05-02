import { View, Text, Pressable } from "react-native";
import { Trash2 } from "lucide-react-native";
import Animated, { FadeInDown, LinearTransition } from "react-native-reanimated";
import { VoiceNoteCard } from "@/components/voice-notes/VoiceNoteCard";
import { FileCard } from "@/components/files/FileCard";
import type { TimelineItem } from "@/hooks/useNoteTimeline";
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

  // Build display-index map for text notes (1 = first added, N = most recent)
  const textItems = timeline.filter(
    (t): t is TimelineItem & { kind: "text" } => t.kind === "text",
  );
  const textDisplayMap = new Map<number, number>();
  [...textItems]
    .sort((a, b) => a.entry.addedAt - b.entry.addedAt)
    .forEach((item, i) => textDisplayMap.set(item.sourceIndex, i + 1));

  return (
    <View className="gap-2" testID="note-timeline">
      {timeline.map((item) => {
        if (item.kind === "file") {
          if (item.file.category === "voice-note") {
            return (
              <Animated.View
                key={`file-${item.file.id}`}
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
              key={`file-${item.file.id}`}
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

        // Text note
        const displayIndex =
          textDisplayMap.get(item.sourceIndex) ?? item.sourceIndex + 1;
        return (
          <Animated.View
            key={`note-${item.sourceIndex}`}
            layout={TIMELINE_ROW_LAYOUT}
            entering={TIMELINE_ROW_ENTRY}
          >
            <View className="flex-row items-start gap-3 rounded-lg border border-border bg-card p-3">
              <View className="min-h-8 min-w-8 items-center justify-center rounded-md bg-secondary px-2 py-1">
                <Text className="text-sm font-semibold text-foreground">
                  {displayIndex}
                </Text>
              </View>
              <Text className="flex-1 text-body text-foreground">
                {item.entry.text}
              </Text>
              <Text
                className="text-xs text-muted-foreground self-center"
                testID={`text-note-captured-at-${item.sourceIndex}`}
              >
                {formatCapturedAt(item.entry.addedAt)}
              </Text>
              {!readOnly && onRemoveNote && (
                <Pressable
                  onPress={() => onRemoveNote(item.sourceIndex)}
                  hitSlop={8}
                  className="self-center h-8 w-8 items-center justify-center rounded-md"
                  accessibilityLabel="Delete note"
                >
                  <Trash2 size={16} color={colors.danger.DEFAULT} />
                </Pressable>
              )}
            </View>
          </Animated.View>
        );
      })}
    </View>
  );
}
