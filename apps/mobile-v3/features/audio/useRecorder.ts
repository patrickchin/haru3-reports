import { useCallback, useRef, useState, useEffect } from 'react';
import {
  useAudioRecorder,
  useAudioRecorderState,
  RecordingPresets,
  setAudioModeAsync,
  requestRecordingPermissionsAsync,
} from 'expo-audio';
import { audio$ } from '@/lib/state/observables';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseRecorderResult {
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<string | null>;
  isRecording: boolean;
  duration: number;
  amplitudes: number[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const METERING_INTERVAL_MS = 100;
const MAX_AMPLITUDES = 30;
const IS_E2E_MOCK = process.env.EXPO_PUBLIC_E2E_MOCK_VOICE_NOTE === 'true';

/**
 * Normalise metering dB (roughly -160..0) into 0..1.
 * Values below -60 dB are treated as silence.
 */
function normaliseMetering(db: number): number {
  'worklet';
  const clamped = Math.max(-60, Math.min(0, db));
  return (clamped + 60) / 60;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useRecorder(): UseRecorderResult {
  const recorder = useAudioRecorder(
    { ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true },
  );
  const recorderState = useAudioRecorderState(recorder, METERING_INTERVAL_MS);

  const meterTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [amplitudes, setAmplitudes] = useState<number[]>([]);

  // Sync recorder state to local state & observables
  useEffect(() => {
    if (!recorderState.isRecording) return;

    const secs = recorderState.durationMillis / 1000;
    setDuration(secs);
    audio$.recordingDuration.set(secs);

    if (recorderState.metering != null) {
      const norm = normaliseMetering(recorderState.metering);
      setAmplitudes((prev) => [...prev, norm].slice(-MAX_AMPLITUDES));
    }
  }, [recorderState.isRecording, recorderState.durationMillis, recorderState.metering]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (meterTimerRef.current) clearInterval(meterTimerRef.current);
    };
  }, []);

  // --------------------------------------------------
  // startRecording
  // --------------------------------------------------
  const startRecording = useCallback(async () => {
    // E2E mock: simulate recording without mic
    if (IS_E2E_MOCK) {
      setIsRecording(true);
      setDuration(0);
      setAmplitudes([]);
      audio$.isRecording.set(true);
      audio$.recordingDuration.set(0);

      meterTimerRef.current = setInterval(() => {
        setDuration((d) => {
          const next = d + METERING_INTERVAL_MS / 1000;
          audio$.recordingDuration.set(next);
          return next;
        });
        setAmplitudes((prev) => {
          const fake = Math.random() * 0.6 + 0.1;
          const next = [...prev, fake].slice(-MAX_AMPLITUDES);
          return next;
        });
      }, METERING_INTERVAL_MS);
      return;
    }

    // Request permission
    const { granted } = await requestRecordingPermissionsAsync();
    if (!granted) {
      throw new Error('Microphone permission not granted');
    }

    // Configure audio mode for recording
    await setAudioModeAsync({
      allowsRecording: true,
      playsInSilentMode: true,
    });

    await recorder.prepareToRecordAsync();
    recorder.record();

    setIsRecording(true);
    setDuration(0);
    setAmplitudes([]);
    audio$.isRecording.set(true);
    audio$.recordingDuration.set(0);
  }, [recorder]);

  // --------------------------------------------------
  // stopRecording
  // --------------------------------------------------
  const stopRecording = useCallback(async (): Promise<string | null> => {
    if (meterTimerRef.current) {
      clearInterval(meterTimerRef.current);
      meterTimerRef.current = null;
    }

    setIsRecording(false);
    audio$.isRecording.set(false);

    // E2E mock: return a placeholder URI without real mic input
    if (IS_E2E_MOCK) {
      return `file:///tmp/mock-voice-note-${Date.now()}.m4a`;
    }

    try {
      await recorder.stop();
      const uri = recorder.uri;

      // Restore audio mode for playback
      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
      });

      return uri ?? null;
    } catch (err) {
      console.error('Failed to stop recording:', err);
      return null;
    }
  }, [recorder]);

  return { startRecording, stopRecording, isRecording, duration, amplitudes };
}
