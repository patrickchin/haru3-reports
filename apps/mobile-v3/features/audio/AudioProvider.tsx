import React, { createContext, useCallback, useContext, useEffect, useRef } from 'react';
import {
  createAudioPlayer,
  setAudioModeAsync,
  type AudioPlayer,
} from 'expo-audio';
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
  const playerRef = useRef<AudioPlayer | null>(null);
  const recorder = useRecorder();

  // Configure audio session on mount
  useEffect(() => {
    setAudioModeAsync({
      allowsRecording: true,
      playsInSilentMode: true,
      interruptionMode: 'duckOthers',
    }).catch(console.error);

    return () => {
      playerRef.current?.remove();
      playerRef.current = null;
    };
  }, []);

  const playSound = useCallback(async (uri: string) => {
    // Remove previous player
    if (playerRef.current) {
      playerRef.current.remove();
      playerRef.current = null;
    }

    await setAudioModeAsync({
      allowsRecording: false,
      playsInSilentMode: true,
      interruptionMode: 'duckOthers',
    });

    const player = createAudioPlayer(uri);
    playerRef.current = player;
    player.play();
  }, []);

  const pauseSound = useCallback(async () => {
    playerRef.current?.pause();
  }, []);

  const stopSound = useCallback(async () => {
    if (playerRef.current) {
      playerRef.current.remove();
      playerRef.current = null;
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
