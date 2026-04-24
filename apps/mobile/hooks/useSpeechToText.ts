import { useCallback, useRef, useState } from "react";
import {
  AudioModule,
  RecordingPresets,
  useAudioRecorder,
} from "expo-audio";
import { transcribeAudio } from "../lib/transcribe";

interface UseSpeechToTextOptions {
  onResult: (transcript: string) => void;
}

interface UseSpeechToTextResult {
  isRecording: boolean;
  interimTranscript: string;
  error: string | null;
  start: () => Promise<void>;
  stop: () => Promise<void>;
}

/**
 * Record audio on-device and transcribe it via the `transcribe-audio`
 * Supabase Edge Function. The provider (OpenAI / Groq / Deepgram) is
 * configured server-side — see `lib/transcribe.ts` for a client-side
 * override knob.
 *
 * While transcription is in-flight, `interimTranscript` is set to
 * `"Transcribing…"` so the UI can show progress.
 */
export function useSpeechToText(
  { onResult }: UseSpeechToTextOptions,
): UseSpeechToTextResult {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [isRecording, setIsRecording] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  const start = useCallback(async () => {
    setError(null);
    setInterimTranscript("");
    cancelledRef.current = false;

    const permission = await AudioModule.requestRecordingPermissionsAsync();
    if (!permission.granted) {
      setError("Microphone permission denied");
      return;
    }

    try {
      await recorder.prepareToRecordAsync();
      recorder.record();
      setIsRecording(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to start recording",
      );
      setIsRecording(false);
    }
  }, [recorder]);

  const stop = useCallback(async () => {
    if (!isRecording) return;
    setIsRecording(false);

    try {
      await recorder.stop();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to stop recording",
      );
      return;
    }

    const uri = recorder.uri;
    if (!uri) {
      setError("No audio was recorded");
      return;
    }

    if (cancelledRef.current) return;

    setInterimTranscript("Transcribing…");
    try {
      const result = await transcribeAudio(uri);
      setInterimTranscript("");
      const trimmed = result.text.trim();
      if (trimmed) onResult(trimmed);
    } catch (err) {
      setInterimTranscript("");
      setError(err instanceof Error ? err.message : "Transcription failed");
    }
  }, [recorder, isRecording, onResult]);

  return { isRecording, interimTranscript, error, start, stop };
}
