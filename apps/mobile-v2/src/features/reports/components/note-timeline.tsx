/**
 * Notes timeline — list of notes with add-note input at bottom.
 *
 * Phase 0: Text notes only. Wave 2 adds voice notes.
 */
import { useState } from "react";
import { View, Text, TextInput, ScrollView } from "react-native";
import { Button } from "@/shared/components/Button";
import { Sheet } from "@/shared/components/Sheet";
import { EmptyState } from "@/shared/components/EmptyState";
import { testIds } from "@/infra/test-ids";
import { useReportNotes } from "../queries";
import { useAddTextNote, useSoftDeleteNote } from "../mutations";
import { NoteRow } from "./note-row";
import { RecordButton, useVoicePipeline } from "@/features/voice-notes";
import { useAuth } from "@/features/auth";

type NoteTimelineProps = {
  reportId: string;
  projectId: string;
};

export function NoteTimeline({ reportId, projectId }: NoteTimelineProps) {
  const { data: notes, isLoading } = useReportNotes(reportId);
  const addTextNote = useAddTextNote();
  const deleteNote = useSoftDeleteNote();
  const voicePipeline = useVoicePipeline();
  const { user } = useAuth();

  const [noteText, setNoteText] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [showVoiceRecorder, setShowVoiceRecorder] = useState(false);

  const handleAddNote = async () => {
    if (!noteText.trim()) return;
    await addTextNote.mutateAsync({
      reportId,
      projectId,
      noteText: noteText.trim(),
    });
    setNoteText("");
  };

  const handleDeleteNote = async (noteId: string) => {
    await deleteNote.mutateAsync({ noteId, reportId });
    setDeleteConfirm(null);
  };

  const handleRecordingComplete = async (result: { uri: string; durationMs: number }) => {
    if (!user) return;
    setShowVoiceRecorder(false);
    try {
      await voicePipeline.mutateAsync({
        audioUri: result.uri,
        durationMs: result.durationMs,
        projectId,
        reportId,
        uploaderId: user.id,
      });
    } catch (err) {
      // Error handling via voicePipeline.error
    }
  };

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center">
        <Text className="text-gray-500">Loading notes...</Text>
      </View>
    );
  }

  return (
    <View className="flex-1" testID={testIds.notes.timeline}>
      <ScrollView className="flex-1 p-4" contentContainerClassName="pb-4">
        {notes && notes.length > 0 ? (
          notes.map((note) => (
            <NoteRow
              key={note.id}
              note={note}
              onDelete={(id) => setDeleteConfirm(id)}
            />
          ))
        ) : (
          <EmptyState title="No notes yet" message="Add your first note below." />
        )}
      </ScrollView>

      {/* Add note input */}
      <View className="p-4 border-t border-gray-200 bg-white">
        <TextInput
          className="rounded-md border border-gray-300 bg-white px-3 py-2 text-base text-gray-900 mb-3"
          value={noteText}
          onChangeText={setNoteText}
          placeholder="Add a note..."
          multiline
          numberOfLines={3}
          testID={testIds.notes.addNoteInput}
        />
        <View className="flex-row gap-3">
          <View className="flex-1">
            <Button
              variant="primary"
              onPress={handleAddNote}
              disabled={!noteText.trim() || addTextNote.isPending}
              loading={addTextNote.isPending}
              testID={testIds.notes.addNoteButton}
            >
              <Text className="text-white font-medium">Add Note</Text>
            </Button>
          </View>
          <Button
            variant="secondary"
            onPress={() => setShowVoiceRecorder(true)}
            testID={testIds.notes.addVoiceButton}
          >
            <Text className="font-medium">🎤</Text>
          </Button>
        </View>
      </View>

      {/* Voice recorder sheet */}
      <Sheet visible={showVoiceRecorder} onClose={() => setShowVoiceRecorder(false)}>
        <Sheet.Title>Record Voice Note</Sheet.Title>
        <Sheet.Body>
          <View className="items-center py-8">
            <RecordButton
              onRecordingComplete={handleRecordingComplete}
              onError={(err) => console.error("Recording error:", err)}
            />
            {voicePipeline.isPending && (
              <Text className="text-sm text-muted mt-4">Processing voice note...</Text>
            )}
            {voicePipeline.error && (
              <Text className="text-sm text-destructive mt-4">
                {voicePipeline.error.message}
              </Text>
            )}
          </View>
        </Sheet.Body>
        <Sheet.Actions>
          <Button variant="ghost" onPress={() => setShowVoiceRecorder(false)}>
            <Text>Cancel</Text>
          </Button>
        </Sheet.Actions>
      </Sheet>

      {/* Delete confirmation sheet */}
      <Sheet visible={!!deleteConfirm} onClose={() => setDeleteConfirm(null)}>
        <Sheet.Title>Delete Note</Sheet.Title>
        <Sheet.Body>
          <Text className="text-gray-700">Are you sure you want to delete this note?</Text>
        </Sheet.Body>
        <Sheet.Actions>
          <Button variant="ghost" onPress={() => setDeleteConfirm(null)}>
            <Text className="text-gray-700">Cancel</Text>
          </Button>
          <Button
            variant="destructive"
            onPress={() => deleteConfirm && handleDeleteNote(deleteConfirm)}
            loading={deleteNote.isPending}
          >
            <Text className="text-white">Delete</Text>
          </Button>
        </Sheet.Actions>
      </Sheet>
    </View>
  );
}
