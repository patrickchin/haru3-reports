import { forwardRef } from "react";
import { ScrollView, Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { Mic, Sparkles } from "lucide-react-native";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { NoteTimeline } from "@/components/notes/NoteTimeline";
import { useGenerateReport } from "@/components/reports/generate/GenerateReportProvider";
import { colors } from "@/lib/design-tokens/colors";

interface NotesTabPaneProps {
  width: number;
}

/**
 * Notes tab. Reads timeline data, voice/photo handlers, and the
 * regenerate CTA state from `useGenerateReport()` so the screen no
 * longer drills 16 props through here.
 */
export const NotesTabPane = forwardRef<ScrollView, NotesTabPaneProps>(
  function NotesTabPane({ width }, ref) {
    const {
      timeline,
      voice,
      photo,
      members,
      notes,
      generation,
      preview,
      handleRegenerate,
    } = useGenerateReport();

    const hasReport = generation.report !== null;
    const upToDate = hasReport && generation.notesSinceLastGeneration === 0;
    const ctaLabel = generation.isUpdating
      ? "Generating…"
      : !hasReport
        ? "Generate report"
        : upToDate
          ? "Report up to date"
          : `Update report (${generation.notesSinceLastGeneration} new note${generation.notesSinceLastGeneration === 1 ? "" : "s"})`;

    return (
      <View style={{ width }} className="flex-1">
        {timeline.items.length > 0 && (
          <Animated.View entering={FadeIn} className="px-5 pb-2 pt-1">
            <Button
              testID="btn-generate-update-report"
              variant="hero"
              size="xl"
              className="w-full"
              onPress={handleRegenerate}
              disabled={generation.isUpdating || upToDate}
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
            timeline={timeline.items}
            isLoading={timeline.isLoading}
            transcriptionsByFileId={voice.voiceTranscriptionsByFileId}
            transcribingFileIds={voice.pendingVoiceTranscriptionIds}
            memberNames={members}
            noteCreatedAtByFileId={timeline.noteCreatedAtByFileId}
            noteAuthorByFileId={timeline.noteAuthorByFileId}
            onRemoveNote={notes.setDeleteIndex}
            onOpenFile={preview.openFile}
            onRetryPendingPhoto={photo.handleRetryPendingPhoto}
            onDiscardPendingPhoto={photo.handleDiscardPendingPhoto}
            onRetryPendingVoice={voice.handleRetryPendingVoice}
            onDiscardPendingVoice={voice.handleDiscardPendingVoice}
          />

          {timeline.items.length === 0 && !timeline.isLoading && (
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
