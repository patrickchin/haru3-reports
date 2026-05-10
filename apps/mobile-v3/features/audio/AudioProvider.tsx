import React, { createContext, useCallback, useContext, useEffect, useRef } from 'react';
import { Audio } from 'expo-av';
import { useRecorder } from './useRecorder';

// ---------------------------------------------------------------------------
// Context types
// ---------------------------------------------------------------------------

export interface AudioContextValue {
  /** Start a new recording. Throws if mic permission denied. */
  startRecording: () => Promise<void>;
  /** Stop the current recording. Returns the local file URI. */
  stopRecording: () => Promise<string | null>;
  /** Play a sound from a remote/local URL. */
  playSound: (uri: string) => Promise<void>;
  /** Pause the currently playing sound. */
  pauseSound: () => Promise<void>;
  /** Stop & unload the currently playing sound. */
  stopSound: () => Promise<void>;
  /** Whether a recording is in progress. */
  isRecording: boolean;
  /** Current recording duration in seconds. */
  recordingDuration: number;
  /** Last N amplitude samples (0-1). */
  amplitudes: number[];
}

const AudioContext = createContext<AudioContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function AudioProvider({ children }: { children: React.ReactNode }) {
  const soundRef = useRef<Audio.Sound | null>(null);
  const recorder = useRecorder();

  // Configure audio session on mount
  useEffect(() => {
    Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
      shouldDuckAndroid: true,
    }).catch(console.error);

    return () => {
      soundRef.current?.unloadAsync().catch(() => {});
    };
  }, []);

  const playSound = useCallback(async (uri: string) => {
    // Unload previous sound
    if (soundRef.current) {
      await soundRef.current.unloadAsync().catch(() => {});
      soundRef.current = null;
    }

    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      shouldDuckAndroid: true,
    });

    const { sound } = await Audio.Sound.createAsync(
      { uri },
      { shouldPlay: true },
    );
    soundRef.current = sound;
  }, []);

  const pauseSound = useCallback(async () => {
    await soundRef.current?.pauseAsync();
  }, []);

  const stopSound = useCallback(async () => {
    if (soundRef.current) {
      await soundRef.current.stopAsync().catch(() => {});
      await soundRef.current.unloadAsync().catch(() => {});
      soundRef.current = null;
    }
  }, []);

  const value: AudioContextValue = {
    startRecording: recorder.startRecording,
    stopRecording: recorder.stopRecording,
    playSound,
    pauseSound,
    stopSound,
    isRecording: recorder.isRecording,
    recordingDuration: recorder.duration,
    amplitudes: recorder.amplitudes,
  };

  return (
    <AudioContext.Provider value={value}>
      {children}
    </AudioContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Consumer hook
// ---------------------------------------------------------------------------

export function useAudio(): AudioContextValue {
  const ctx = useContext(AudioContext);
  if (!ctx) {
    throw new Error('useAudio must be used within an AudioProvider');
  }
  return ctx;
}
