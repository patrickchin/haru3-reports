/**
 * Voice note card — playback UI + transcript sheet + summary section + delete sheet.
 *
 * Target ~150 LOC via Sheet composition. All dialogs use compound Sheet.
 */
import { useState } from "react";
import { View, Text, Pressable } from "react-native";
import { useAudioPlayback } from "@/features/audio";
import { Sheet } from "@/shared/components/Sheet";
import { Button } from "@/shared/components/Button";
import { testIds } from "@/infra/test-ids";
import type { FileMetadata } from "@/infra/db-types";

type VoiceNoteCardProps = {
  file: FileMetadata;
  authorName?: string;
  onDelete?: () => void;
};

export function VoiceNoteCard({ file, authorName, onDelete }: VoiceNoteCardProps) {
  const audio = useAudioPlayback();
  const [showTranscript, setShowTranscript] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  const isPlaying = audio.trackId === file.id && audio.isPlaying;
  const durationMs = file.voice_duration_ms || file.duration_ms || 0;

  const handlePlayPause = async () => {
    if (isPlaying) {
      audio.pause();
    } else {
      await audio.play({
        id: file.id,
        uri: file.storage_path, // TODO: Generate signed URL
        durationMs,
      });
    }
  };

  const handleDelete = () => {
    onDelete?.();
    setShowDelete(false);
  };

  return (
    <>
      <View testID={testIds.voiceNotes.card(file.id)} className="bg-card rounded-lg p-4">
        {/* Title + Summary */}
        {file.voice_title && (
          <Text
            testID={testIds.voiceNotes.title(file.id)}
            className="text-title-sm text-foreground mb-2"
            numberOfLines={2}
          >
            {file.voice_title}
          </Text>
        )}
        {file.voice_summary && (
          <Text
            testID={testIds.voiceNotes.summary(file.id)}
            className="text-body-sm text-muted mb-3"
            numberOfLines={3}
          >
            {file.voice_summary}
          </Text>
        )}

        {/* Playback controls */}
        <View className="flex-row items-center gap-3">
          <Pressable
            testID={
              isPlaying
                ? testIds.voiceNotes.pauseButton(file.id)
                : testIds.voiceNotes.playButton(file.id)
            }
            onPress={handlePlayPause}
            className="w-10 h-10 rounded-full bg-primary items-center justify-center"
          >
            <Text className="text-white text-lg">{isPlaying ? "⏸" : "▶"}</Text>
          </Pressable>

          {/* Progress bar */}
          <View className="flex-1" testID={testIds.voiceNotes.progressBar(file.id)}>
            <View className="h-1 bg-gray-200 rounded-full overflow-hidden">
              {audio.trackId === file.id && durationMs > 0 && (
                <View
                  className="h-full bg-primary"
                  style={{ width: `${(audio.positionMs / durationMs) * 100}%` }}
                />
              )}
            </View>
            <Text className="text-xs text-muted mt-1">
              {formatDuration(audio.trackId === file.id ? audio.positionMs : 0)} /{" "}
              {formatDuration(durationMs)}
            </Text>
          </View>

          {/* More button */}
          <Pressable
            testID={testIds.voiceNotes.moreButton(file.id)}
            onPress={() => setShowTranscript(true)}
            className="px-3 py-2"
          >
            <Text className="text-primary">⋯</Text>
          </Pressable>
        </View>

        {authorName && (
          <Text className="text-xs text-muted mt-2">Recorded by {authorName}</Text>
        )}
      </View>

      {/* Transcript sheet */}
      <Sheet visible={showTranscript} onClose={() => setShowTranscript(false)}>
        <Sheet.Title>Transcript</Sheet.Title>
        <Sheet.Body>
          {file.voice_transcript ? (
            <Text
              testID={testIds.voiceNotes.transcriptText(file.id)}
              className="text-body text-foreground"
            >
              {file.voice_transcript}
            </Text>
          ) : (
            <Text className="text-muted">No transcript available</Text>
          )}
        </Sheet.Body>
        <Sheet.Actions>
          <Button variant="destructive" onPress={() => setShowDelete(true)}>
            Delete
          </Button>
          <Button variant="ghost" onPress={() => setShowTranscript(false)}>
            Close
          </Button>
        </Sheet.Actions>
      </Sheet>

      {/* Delete confirmation sheet */}
      <Sheet visible={showDelete} onClose={() => setShowDelete(false)}>
        <Sheet.Title>Delete Voice Note</Sheet.Title>
        <Sheet.Body>
          <Text className="text-body text-foreground">
            Are you sure you want to delete this voice note? This cannot be undone.
          </Text>
        </Sheet.Body>
        <Sheet.Actions>
          <Button
            testID={testIds.voiceNotes.deleteButton(file.id)}
            variant="destructive"
            onPress={handleDelete}
          >
            Delete
          </Button>
          <Button variant="ghost" onPress={() => setShowDelete(false)}>
            Cancel
          </Button>
        </Sheet.Actions>
      </Sheet>
    </>
  );
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
