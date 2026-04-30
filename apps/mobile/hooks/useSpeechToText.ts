import { useCallback, useEffect, useRef, useState } from "react";
import {
  AudioModule,
  RecordingPresets,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import * as FileSystem from "expo-file-system/legacy";
import { transcribeAudio } from "../lib/transcribe";
import { backend } from "@/lib/backend";
import { transcribeVoiceNote, uploadVoiceNote } from "@/lib/voice-note-flow";
import type { FileMetadataRow } from "@/lib/file-upload";

const E2E_MOCK_VOICE_NOTE_AUDIO_BASE64 = "AAAA";

export interface VoiceNoteSaveContext {
  /** Project that the voice note belongs to. */
  projectId: string;
  /** Authenticated user creating the recording. */
  uploadedBy: string;
}

interface UseSpeechToTextOptions {
  onResult: (transcript: string) => void;
  /**
   * When provided, the recorded audio is uploaded to Supabase Storage and a
   * file_metadata row is created so the voice note can be replayed later.
   * When omitted, behaviour is unchanged: transcription only.
   */
  saveVoiceNote?: VoiceNoteSaveContext;
  /** Notified as soon as the voice-note file row exists, before transcription finishes. */
  onVoiceNoteUploaded?: (args: { metadata: FileMetadataRow }) => void;
  /**
   * Notified after background transcription finishes. Receives both the
   * file metadata and the final transcript (empty string if transcription
   * failed) so callers can persist a `report_notes` row linking the voice
   * file to the active report.
   */
  onVoiceNoteSaved?: (args: { metadata: FileMetadataRow; transcript: string }) => void;
}

interface UseSpeechToTextResult {
  isRecording: boolean;
  /**
   * True while a direct transcription-only recording is being processed.
   * Saved voice notes upload and transcribe in the background so the
   * composer can accept another note immediately after recording stops.
   */
  isTranscribing: boolean;
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
  { onResult, saveVoiceNote, onVoiceNoteUploaded, onVoiceNoteSaved }: UseSpeechToTextOptions,
): UseSpeechToTextResult {
  const recorder = useAudioRecorder(
    { ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true },
  );
  const recorderState = useAudioRecorderState(recorder, 50); // poll every 50 ms ≈ 20 fps
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const onResultRef = useRef(onResult);
  const onVoiceNoteUploadedRef = useRef(onVoiceNoteUploaded);
  const onVoiceNoteSavedRef = useRef(onVoiceNoteSaved);
  const cancelledRef = useRef(false);

  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);

  useEffect(() => {
    onVoiceNoteUploadedRef.current = onVoiceNoteUploaded;
  }, [onVoiceNoteUploaded]);

  useEffect(() => {
    onVoiceNoteSavedRef.current = onVoiceNoteSaved;
  }, [onVoiceNoteSaved]);

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

    if (getE2EMockVoiceNoteTranscript()) {
      setIsRecording(true);
      return;
    }

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
    const shouldShowTranscribingState = !saveVoiceNote;
    if (shouldShowTranscribingState) {
      setIsRecording(false);
    }
    setIsTranscribing(shouldShowTranscribingState);
    setInterimTranscript(shouldShowTranscribingState ? "Transcribing…" : "");

    const stubRecorder = shouldStubRecorder();
    let audioUri: string | null = null;

    if (stubRecorder) {
      try {
        audioUri = await writeE2EMockVoiceNoteFile();
      } catch (err) {
        if (!mountedRef.current) return;
        setIsRecording(false);
        setIsTranscribing(false);
        setInterimTranscript("");
        setError(err instanceof Error ? err.message : "Failed to create mock voice note");
        return;
      }
    } else {
      try {
        await recorder.stop();
        await AudioModule.setAudioModeAsync({ allowsRecording: false });
      } catch (err) {
        if (!mountedRef.current) return;
        setIsRecording(false);
        setIsTranscribing(false);
        setInterimTranscript("");
        setError(err instanceof Error ? err.message : "Failed to stop recording");
        return;
      }

      audioUri = recorder.uri;
      if (!audioUri) {
        setIsRecording(false);
        setIsTranscribing(false);
        setInterimTranscript("");
        setError("No audio was recorded");
        return;
      }
    }

    if (cancelledRef.current || !mountedRef.current) {
      setIsRecording(false);
      setIsTranscribing(false);
      setInterimTranscript("");
      return;
    }

    if (saveVoiceNote) {
      setIsRecording(false);
      const durationMs = recorderState.durationMillis ?? null;
      void (async () => {
        let uploadedMetadata: FileMetadataRow | null = null;
        try {
          const sizeBytes = await getFileSizeBytes(audioUri);
          const filename = `voice-${Date.now()}.m4a`;
          const uploaded = await uploadVoiceNote({
            backend,
            projectId: saveVoiceNote.projectId,
            uploadedBy: saveVoiceNote.uploadedBy,
            audioUri,
            filename,
            mimeType: "audio/m4a",
            sizeBytes,
            durationMs,
            readBytes: readBytesFromUri,
          });
          uploadedMetadata = uploaded.metadata;
          if (!mountedRef.current || cancelledRef.current) return;
          onVoiceNoteUploadedRef.current?.({ metadata: uploaded.metadata });

          const result = await transcribeVoiceNote({ audioUri, transcribe: transcribeAudio });
          if (!mountedRef.current || cancelledRef.current) return;
          if (result.transcriptionFailed) {
            setError(result.transcriptionError ?? "Transcription failed");
          } else if (result.transcription) {
            onResultRef.current(result.transcription);
          }
          if (!mountedRef.current || cancelledRef.current) return;
          onVoiceNoteSavedRef.current?.({
            metadata: uploaded.metadata,
            transcript: result.transcription,
          });
        } catch (err) {
          if (!mountedRef.current || cancelledRef.current) return;
          setError(
            err instanceof Error
              ? err.message
              : uploadedMetadata
                ? "Transcription failed"
                : "Voice note save failed",
          );
          if (uploadedMetadata) {
            onVoiceNoteSavedRef.current?.({
              metadata: uploadedMetadata,
              transcript: "",
            });
          }
        }
      })();
      return;
    }

    try {
      const result = await transcribeAudio(audioUri);
      if (!mountedRef.current || cancelledRef.current) return;
      setIsTranscribing(false);
      setInterimTranscript("");
      const trimmed = result.text.trim();
      if (trimmed) onResultRef.current(trimmed);
    } catch (err) {
      if (!mountedRef.current) return;
      setIsTranscribing(false);
      setInterimTranscript("");
      setError(err instanceof Error ? err.message : "Transcription failed");
    }
  }, [recorder, isRecording, saveVoiceNote, recorderState.durationMillis]);

  return { isRecording, isTranscribing, amplitude, interimTranscript, error, start, stop };
}

/**
 * iOS simulator mic recording is unreliable / silent. When this flag is
 * baked into the Metro bundle, the hook skips `expo-audio` entirely and
 * writes a tiny stub audio file in place of a real recording so the
 * subsequent transcribe-audio upload has something to send. The transcript
 * itself is mocked server-side via the edge function's `USE_FIXTURES=true`
 * mode — not on the client.
 */
function shouldStubRecorder(): boolean {
  return process.env.EXPO_PUBLIC_E2E_MOCK_VOICE_NOTE === "true";
}

/** Back-compat alias preserved for tests / other callers of `start()`. */
function getE2EMockVoiceNoteTranscript(): boolean {
  return shouldStubRecorder();
}

async function writeE2EMockVoiceNoteFile(): Promise<string> {
  const baseDirectory = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
  if (!baseDirectory) {
    throw new Error("No writable directory available for mock voice notes");
  }

  const uri = `${baseDirectory}e2e-voice-note-${Date.now()}.m4a`;
  await FileSystem.writeAsStringAsync(uri, E2E_MOCK_VOICE_NOTE_AUDIO_BASE64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return uri;
}

async function getFileSizeBytes(uri: string): Promise<number> {
  const info = await FileSystem.getInfoAsync(uri);
  return info.exists && "size" in info && typeof info.size === "number"
    ? info.size
    : 0;
}

async function readBytesFromUri(uri: string): Promise<Uint8Array> {
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const binary =
    typeof atob === "function"
      ? atob(base64)
      : Buffer.from(base64, "base64").toString("binary");
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
