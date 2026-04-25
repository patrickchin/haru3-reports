import { useCallback, useEffect, useRef, useState } from "react";
import {
  AudioModule,
  RecordingPresets,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import { transcribeAudio } from "../lib/transcribe";

interface UseSpeechToTextOptions {
  onResult: (transcript: string) => void;
}

interface UseSpeechToTextResult {
  isRecording: boolean;
  /** Normalised mic amplitude 0–1, updated live while recording. */
  amplitude: number;
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
 *
 * `amplitude` is a normalised 0–1 value derived from the recorder's live
 * metering data (dBFS), suitable for driving a waveform visualisation.
 */
export function useSpeechToText(
  { onResult }: UseSpeechToTextOptions,
): UseSpeechToTextResult {
  const recorder = useAudioRecorder(
    { ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true },
  );
  const recorderState = useAudioRecorderState(recorder, 50); // poll every 50 ms ≈ 20 fps
  const [isRecording, setIsRecording] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const onResultRef = useRef(onResult);
  const cancelledRef = useRef(false);

  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      cancelledRef.current = true;
    };
  }, []);

  // Convert dBFS metering (-160..0) to normalised 0–1 amplitude.
  // We clamp to a practical range of -50 dBFS (silence) → 0 dBFS (peak).
  const rawDb = recorderState.metering ?? -160;
  const amplitude = isRecording
    ? Math.max(0, Math.min(1, (rawDb + 50) / 50))
    : 0;

  const start = useCallback(async () => {
    if (!mountedRef.current) return;
    setError(null);
    setInterimTranscript("");
    cancelledRef.current = false;

    const permission = await AudioModule.requestRecordingPermissionsAsync();
    if (!permission.granted) {
      setError("Microphone permission denied");
      return;
    }

    try {
      await AudioModule.setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      if (!mountedRef.current) return;
      setIsRecording(true);
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err.message : "Failed to start recording");
      setIsRecording(false);
    }
  }, [recorder]);

  const stop = useCallback(async () => {
    if (!isRecording || !mountedRef.current) return;
    setIsRecording(false);

    try {
      await recorder.stop();
      await AudioModule.setAudioModeAsync({ allowsRecording: false });
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err.message : "Failed to stop recording");
      return;
    }

    const uri = recorder.uri;
    if (!uri) {
      setError("No audio was recorded");
      return;
    }

    if (cancelledRef.current || !mountedRef.current) return;
    setInterimTranscript("Transcribing…");
    try {
      const result = await transcribeAudio(uri);
      if (!mountedRef.current || cancelledRef.current) return;
      setInterimTranscript("");
      const trimmed = result.text.trim();
      if (trimmed) onResultRef.current(trimmed);
    } catch (err) {
      if (!mountedRef.current) return;
      setInterimTranscript("");
      setError(err instanceof Error ? err.message : "Transcription failed");
    }
  }, [recorder, isRecording]);

  return { isRecording, amplitude, interimTranscript, error, start, stop };
}
