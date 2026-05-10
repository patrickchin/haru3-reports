/**
 * Voice note card — playback UI + transcript sheet + summary section + delete sheet.
 *
 * Queries transcript from report_notes.body by file_id.
 * Proper dialog testIDs for maestro compliance.
 */
import { useCallback, useState } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MoreVertical } from "lucide-react-native";
import { useAudioPlayback } from "@/features/audio";
import { Sheet } from "@/shared/components/Sheet";
import { Button } from "@/shared/components/Button";
import { supabase } from "@/infra/supabase";
import { testIds } from "@/infra/test-ids";
import type { FileMetadata, ReportNote } from "@/infra/db-types";

const PROJECT_FILES_BUCKET = "project-files";

function useSignedUrl(storagePath: string | null | undefined) {
  return useQuery({
    queryKey: ["signedUrl", storagePath],
    enabled: !!storagePath,
    staleTime: 30 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from(PROJECT_FILES_BUCKET)
        .createSignedUrl(storagePath!, 60 * 60);
      if (error || !data) {
        throw new Error(`Signed URL failed: ${error?.message ?? "unknown"}`);
      }
      return data.signedUrl;
    },
  });
}

// Query transcript from report_notes by file_id
function useVoiceNoteTranscript(fileId: string | null) {
  return useQuery({
    queryKey: ["voiceNoteTranscript", fileId],
    enabled: !!fileId,
    staleTime: Infinity,
    queryFn: async () => {
      if (!fileId) return null;
      const { data, error } = await supabase
        .from("report_notes")
        .select("body")
        .eq("file_id", fileId)
        .eq("kind", "voice")
        .maybeSingle();
      if (error) throw error;
      return (data?.body as string) ?? null;
    },
  });
}

type VoiceNoteCardProps = {
  file: FileMetadata;
  reportId?: string;
  authorName?: string;
  onDelete?: () => void;
};

export function VoiceNoteCard({ file, reportId, authorName, onDelete }: VoiceNoteCardProps) {
  const audio = useAudioPlayback();
  const queryClient = useQueryClient();
  const [showTranscript, setShowTranscript] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const { data: signedUrl, isLoading: isLoadingUrl } = useSignedUrl(file.storage_path);
  const { data: transcript } = useVoiceNoteTranscript(file.id);

  const isPlaying = audio.trackId === file.id && audio.isPlaying;
  const durationMs = file.voice_duration_ms || file.duration_ms || 0;

  const handlePlayPause = useCallback(async () => {
    if (!signedUrl || isLoadingUrl) return;
    if (isPlaying) {
      audio.pause();
    } else {
      try {
        await audio.play({
          id: file.id,
          uri: signedUrl,
          durationMs,
        });
      } catch (err) {
        console.error("Playback error:", err);
      }
    }
  }, [signedUrl, isLoadingUrl, isPlaying, file.id, durationMs, audio]);

  const handleDelete = useCallback(async () => {
    setIsDeleting(true);
    try {
      // Soft delete the file
      const { error } = await supabase
        .from("file_metadata")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", file.id);

      if (error) throw error;

      // Invalidate cache
      queryClient.invalidateQueries({ queryKey: ["voiceNoteTranscript", file.id] });
      queryClient.invalidateQueries({ queryKey: ["reports", "id", reportId, "notes"] });

      setShowDeleteConfirm(false);
      onDelete?.();
    } catch (err) {
      console.error("Delete error:", err);
    } finally {
      setIsDeleting(false);
    }
  }, [file.id, reportId, queryClient, onDelete]);

  return (
    <>
      <View testID={testIds.voiceNotes.card(file.id)} className="bg-card rounded-lg p-4 mb-3">
        {/* ID Badge */}
        <Pressable
          testID={testIds.voiceNotes.id(file.id)}
          className="mb-3 flex-row items-center gap-2"
          onPress={() => {
            // Copy to clipboard - for now just a visual element
          }}
        >
          <Text className="text-xs text-muted font-mono">
            id: {file.id.substring(0, 8)}
          </Text>
        </Pressable>

        {/* Title + Summary */}
        {file.voice_title && (
          <Text
            testID={testIds.voiceNotes.title(file.id)}
            className="text-title-sm text-foreground mb-2 font-semibold"
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
            disabled={isLoadingUrl}
            style={{ opacity: isLoadingUrl ? 0.5 : 1 }}
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

          {/* Options menu button */}
          <Pressable
            testID={testIds.voiceNotes.moreButton(file.id)}
            onPress={() => setShowTranscript(true)}
            className="px-2 py-2"
          >
            <MoreVertical size={20} color="#666" />
          </Pressable>
        </View>

        {/* Author */}
        {authorName && (
          <Text className="text-xs text-muted mt-2">Recorded by {authorName}</Text>
        )}

        {/* Transcript display inline if present */}
        {transcript && (
          <View className="mt-3 p-2 bg-gray-50 rounded">
            <Text
              testID={testIds.voiceNotes.transcript(file.id)}
              className="text-xs text-gray-700 leading-5"
              numberOfLines={3}
            >
              {transcript}
            </Text>
          </View>
        )}
      </View>

      {/* Options sheet (transcript/delete actions) */}
      <Sheet visible={showTranscript} onClose={() => setShowTranscript(false)}>
        <Sheet.Title>Voice Note Options</Sheet.Title>
        <Sheet.Body>
          {transcript ? (
            <ScrollView className="max-h-48">
              <Text
                testID={testIds.voiceNotes.transcript(file.id)}
                className="text-body text-foreground leading-6"
              >
                {transcript}
              </Text>
            </ScrollView>
          ) : (
            <Text className="text-body text-muted">No transcript available yet.</Text>
          )}
        </Sheet.Body>
        <Sheet.Actions>
          {file.voice_title && (
            <Button variant="secondary" onPress={() => setShowTranscript(false)}>
              <Text>Summarize</Text>
            </Button>
          )}
          <Button
            testID={testIds.voiceNotes.deleteAction(file.id)}
            variant="destructive"
            onPress={() => setShowDeleteConfirm(true)}
          >
            <Text>Delete</Text>
          </Button>
          <Button variant="ghost" onPress={() => setShowTranscript(false)}>
            <Text>Cancel</Text>
          </Button>
        </Sheet.Actions>
      </Sheet>

      {/* Delete confirmation sheet */}
      <Sheet visible={showDeleteConfirm} onClose={() => setShowDeleteConfirm(false)}>
        <Sheet.Title>Delete Voice Note</Sheet.Title>
        <Sheet.Body>
          <Text className="text-body text-foreground">
            Are you sure you want to delete this voice note? This cannot be undone.
          </Text>
        </Sheet.Body>
        <Sheet.Actions>
          <Button
            testID="dialog-action-0"
            variant="destructive"
            onPress={handleDelete}
            loading={isDeleting}
          >
            <Text>Delete</Text>
          </Button>
          <Button variant="ghost" onPress={() => setShowDeleteConfirm(false)}>
            <Text>Cancel</Text>
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
