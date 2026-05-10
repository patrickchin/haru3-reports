/**
 * Push-to-record button with level meter.
 */
import { View, Text, Pressable } from "react-native";
import { useVoiceRecorder } from "./use-voice-recorder";
import { testIds } from "@/infra/test-ids";

type RecordButtonProps = {
  onRecordingComplete: (result: { uri: string; durationMs: number }) => void;
  onError?: (error: string) => void;
};

export function RecordButton({ onRecordingComplete, onError }: RecordButtonProps) {
  const recorder = useVoiceRecorder();

  const handlePressIn = async () => {
    try {
      await recorder.startRecording();
    } catch (err) {
      onError?.(err instanceof Error ? err.message : "Failed to start recording");
    }
  };

  const handlePressOut = async () => {
    try {
      const result = await recorder.stopRecording();
      onRecordingComplete(result);
    } catch (err) {
      onError?.(err instanceof Error ? err.message : "Failed to stop recording");
    }
  };

  const levelBarHeight = recorder.isRecording
    ? Math.max(4, ((recorder.meteringLevel + 160) / 160) * 40)
    : 4;

  return (
    <View className="items-center gap-2">
      <Pressable
        testID={testIds.voiceNotes.recordButton}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        className={`w-16 h-16 rounded-full items-center justify-center ${
          recorder.isRecording ? "bg-destructive" : "bg-primary"
        }`}
      >
        <Text className="text-white text-2xl">{recorder.isRecording ? "⏹" : "🎤"}</Text>
      </Pressable>

      {recorder.isRecording && (
        <>
          <View
            testID={testIds.voiceNotes.recordingIndicator}
            className="flex-row gap-1 items-end h-10"
          >
            {[...Array(5)].map((_, i) => (
              <View
                key={i}
                testID={testIds.voiceNotes.levelMeter}
                className="w-1 bg-destructive rounded-full"
                style={{ height: levelBarHeight * (1 - i * 0.15) }}
              />
            ))}
          </View>
          <Text className="text-xs text-muted">
            {formatDuration(recorder.durationMs)}
          </Text>
        </>
      )}

      {recorder.error && <Text className="text-xs text-destructive">{recorder.error}</Text>}
    </View>
  );
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
