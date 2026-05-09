import { forwardRef, type ComponentProps } from "react";
import { ScrollView, Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { Mic, Sparkles } from "lucide-react-native";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { NoteTimeline } from "@/components/notes/NoteTimeline";
import { colors } from "@/lib/design-tokens/colors";
import type { FileMetadataRow } from "@/lib/file-upload";
import type { GeneratedSiteReport } from "@/lib/generated-report";

type NoteTimelineProps = ComponentProps<typeof NoteTimeline>;

interface NotesTabPaneProps {
  width: number;
  timeline: NoteTimelineProps["timeline"];
  timelineLoading: boolean;
  voiceTranscriptionsByFileId: NoteTimelineProps["transcriptionsByFileId"];
  pendingVoiceTranscriptionIds: NoteTimelineProps["transcribingFileIds"];
  memberNames: NoteTimelineProps["memberNames"];
  noteCreatedAtByFileId: NoteTimelineProps["noteCreatedAtByFileId"];
  noteAuthorByFileId: NoteTimelineProps["noteAuthorByFileId"];
  onRemoveNote: (i: number) => void;
  onOpenFile: (file: FileMetadataRow) => void;
  onRetryPendingPhoto: (localId: string) => void;
  onDiscardPendingPhoto: (localId: string) => void;
  onRetryPendingVoice: (localId: string) => void;
  onDiscardPendingVoice: (localId: string) => void;
  // Generate / Update CTA
  report: GeneratedSiteReport | null;
  isUpdating: boolean;
  notesSinceLastGeneration: number;
  onRegenerate: () => void;
}

export const NotesTabPane = forwardRef<ScrollView, NotesTabPaneProps>(
  function NotesTabPane(
    {
      width,
      timeline,
      timelineLoading,
      voiceTranscriptionsByFileId,
      pendingVoiceTranscriptionIds,
      memberNames,
      noteCreatedAtByFileId,
      noteAuthorByFileId,
      onRemoveNote,
      onOpenFile,
      onRetryPendingPhoto,
      onDiscardPendingPhoto,
      onRetryPendingVoice,
      onDiscardPendingVoice,
      report,
      isUpdating,
      notesSinceLastGeneration,
      onRegenerate,
    },
    ref,
  ) {
    const hasReport = report !== null;
    const upToDate = hasReport && notesSinceLastGeneration === 0;
    const ctaLabel = isUpdating
      ? "Generating…"
      : !hasReport
        ? "Generate report"
        : upToDate
          ? "Report up to date"
          : `Update report (${notesSinceLastGeneration} new note${notesSinceLastGeneration === 1 ? "" : "s"})`;

    return (
      <View style={{ width }} className="flex-1">
        {timeline.length > 0 && (
          <Animated.View entering={FadeIn} className="px-5 pb-2 pt-1">
            <Button
              testID="btn-generate-update-report"
              variant="hero"
              size="xl"
              className="w-full"
              onPress={onRegenerate}
              disabled={isUpdating || upToDate}
            >
              <View className="flex-row items-center gap-1.5">
                <Sparkles size={16} color={colors.primary.foreground} />
                <Text className="text-base font-semibold text-primary-foreground">
                  {ctaLabel}
                </Text>
              </View>
            </Button>
          </Animated.View>
        )}
        <ScrollView
          ref={ref}
          className="flex-1 px-5"
          contentContainerStyle={{ paddingBottom: 100 }}
          keyboardShouldPersistTaps="handled"
        >
          <NoteTimeline
            timeline={timeline}
            isLoading={timelineLoading}
            transcriptionsByFileId={voiceTranscriptionsByFileId}
            transcribingFileIds={pendingVoiceTranscriptionIds}
            memberNames={memberNames}
            noteCreatedAtByFileId={noteCreatedAtByFileId}
            noteAuthorByFileId={noteAuthorByFileId}
            onRemoveNote={onRemoveNote}
            onOpenFile={onOpenFile}
            onRetryPendingPhoto={onRetryPendingPhoto}
            onDiscardPendingPhoto={onDiscardPendingPhoto}
            onRetryPendingVoice={onRetryPendingVoice}
            onDiscardPendingVoice={onDiscardPendingVoice}
          />

          {timeline.length === 0 && !timelineLoading && (
            <EmptyState
              icon={<Mic size={28} color={colors.muted.foreground} />}
              title="Start capturing site notes"
              description="Record short voice updates or type notes below. The report will build itself as you go."
            />
          )}
        </ScrollView>
      </View>
    );
  },
);
