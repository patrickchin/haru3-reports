import { View, Text, Pressable } from "react-native";
import { Trash2 } from "lucide-react-native";
import Animated, { FadeInDown, LinearTransition } from "react-native-reanimated";
import { VoiceNoteCard } from "@/components/voice-notes/VoiceNoteCard";
import { FileCard } from "@/components/files/FileCard";
import type { TimelineItem } from "@/hooks/useNoteTimeline";
import type { FileMetadataRow } from "@/lib/file-upload";

const TIMELINE_ROW_LAYOUT = LinearTransition.duration(180);
const TIMELINE_ROW_ENTRY = FadeInDown.duration(140);

interface NoteTimelineProps {
  timeline: readonly TimelineItem[];
  isLoading?: boolean;
  error?: Error | null;
  onRemoveNote?: (sourceIndex: number) => void;
  onOpenFile?: (signedUrl: string, file: FileMetadataRow) => void;
  /** Transcripts keyed by `file_metadata.id` for voice notes. Looked up
   *  by `VoiceNoteCard` to render the transcribed body beneath each
   *  voice-note row. */
  transcriptionsByFileId?: ReadonlyMap<string, string>;
  /** Voice-note file ids whose transcript is still being generated. */
  transcribingFileIds?: ReadonlySet<string>;
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
              {!readOnly && onRemoveNote && (
                <Pressable
                  onPress={() => onRemoveNote(item.sourceIndex)}
                  hitSlop={8}
                  className="self-center h-8 w-8 items-center justify-center rounded-md"
                  accessibilityLabel="Delete note"
                >
                  <Trash2 size={16} color="#b91c1c" />
                </Pressable>
              )}
            </View>
          </Animated.View>
        );
      })}
    </View>
  );
}
