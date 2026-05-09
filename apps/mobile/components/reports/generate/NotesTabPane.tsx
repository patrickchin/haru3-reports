import { forwardRef } from "react";
import { ScrollView, View } from "react-native";
import { Mic } from "lucide-react-native";
import { EmptyState } from "@/components/ui/EmptyState";
import { NoteTimeline } from "@/components/notes/NoteTimeline";
import { useGenerateReport } from "@/components/reports/generate/GenerateReportProvider";
import { colors } from "@/lib/design-tokens/colors";

interface NotesTabPaneProps {
  width: number;
}

/**
 * Notes tab. Reads timeline data, voice/photo handlers, and members
 * from `useGenerateReport()`. The Update/Regenerate/Finalize CTAs live
 * in `GenerateReportActionRow` above the tab bar so they're reachable
 * from any tab.
 */
export const NotesTabPane = forwardRef<ScrollView, NotesTabPaneProps>(
  function NotesTabPane({ width }, ref) {
    const { timeline, voice, photo, members, notes, preview } =
      useGenerateReport();

    return (
      <View style={{ width }} className="flex-1">
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
