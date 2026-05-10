/**
 * Voice recorder hook — wraps VoiceRecorder in a React state machine.
 */
import { useCallback, useRef, useState } from "react";
import { VoiceRecorder, type RecordingState } from "./recorder";

export type UseVoiceRecorderState = RecordingState & {
  error: string | null;
};

export type UseVoiceRecorderApi = UseVoiceRecorderState & {
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<{ uri: string; durationMs: number }>;
  cancelRecording: () => Promise<void>;
};

const initialState: UseVoiceRecorderState = {
  isRecording: false,
  isPaused: false,
  durationMs: 0,
  meteringLevel: -160,
  error: null,
};

export function useVoiceRecorder(): UseVoiceRecorderApi {
  const [state, setState] = useState<UseVoiceRecorderState>(initialState);
  const recorderRef = useRef<VoiceRecorder | null>(null);

  const startRecording = useCallback(async () => {
    try {
      setState(initialState);
      const recorder = new VoiceRecorder();
      recorderRef.current = recorder;
      await recorder.start((recordingState) => {
        setState((prev) => ({ ...prev, ...recordingState, error: null }));
      });
    } catch (err) {
      setState((prev) => ({
        ...prev,
        error: err instanceof Error ? err.message : "Failed to start recording",
        isRecording: false,
      }));
      recorderRef.current = null;
    }
  }, []);

  const stopRecording = useCallback(async (): Promise<{ uri: string; durationMs: number }> => {
    if (!recorderRef.current) {
      throw new Error("No active recording");
    }
    try {
      const result = await recorderRef.current.stop();
      setState(initialState);
      recorderRef.current = null;
      return result;
    } catch (err) {
      setState((prev) => ({
        ...prev,
        error: err instanceof Error ? err.message : "Failed to stop recording",
        isRecording: false,
      }));
      recorderRef.current = null;
      throw err;
    }
  }, []);

  const cancelRecording = useCallback(async () => {
    if (!recorderRef.current) return;
    try {
      await recorderRef.current.cancel();
      setState(initialState);
      recorderRef.current = null;
    } catch (err) {
      setState((prev) => ({
        ...prev,
        error: err instanceof Error ? err.message : "Failed to cancel recording",
        isRecording: false,
      }));
      recorderRef.current = null;
    }
  }, []);

  return {
    ...state,
    startRecording,
    stopRecording,
    cancelRecording,
  };
}
