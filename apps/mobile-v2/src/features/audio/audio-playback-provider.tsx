/**
 * Screen-scoped audio playback provider for voice notes.
 *
 * Maintains a single AudioPlayer instance tied to the current screen.
 * Tears down on pathname change or app backgrounding to prevent
 * orphaned players. Implements audio ducking — exclusive session while
 * playing, releases on stop so iOS can auto-resume user's music.
 *
 * Ported from v1 (apps/mobile/lib/audio/AudioPlaybackProvider.tsx).
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AppState, type AppStateStatus } from "react-native";
import { usePathname } from "expo-router";
import { useAudioPlayer, setAudioModeAsync } from "expo-audio";

export type AudioPlaybackState = {
  trackId: string | null;
  isPlaying: boolean;
  isLoading: boolean;
  positionMs: number;
  durationMs: number;
  error: string | null;
};

export type AudioPlaybackApi = AudioPlaybackState & {
  play: (track: { id: string; uri: string; durationMs?: number }) => Promise<void>;
  pause: () => void;
  resume: () => Promise<void>;
  seekTo: (positionMs: number) => Promise<void>;
  stop: () => void;
};

const initialState: AudioPlaybackState = {
  trackId: null,
  isPlaying: false,
  isLoading: false,
  positionMs: 0,
  durationMs: 0,
  error: null,
};

const AudioPlaybackContext = createContext<AudioPlaybackApi | null>(null);

export function useAudioPlayback(): AudioPlaybackApi {
  const ctx = useContext(AudioPlaybackContext);
  if (!ctx) {
    throw new Error("useAudioPlayback must be used inside AudioPlaybackProvider");
  }
  return ctx;
}

const VOICE_NOTE_PLAYBACK_AUDIO_MODE = {
  playsInSilentMode: true,
  allowsRecording: false,
  interruptionMode: "doNotMix" as const,
};

const VOICE_NOTE_RELEASE_AUDIO_MODE = {
  playsInSilentMode: false,
  allowsRecording: false,
  interruptionMode: "mixWithOthers" as const,
};

export function AudioPlaybackProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AudioPlaybackState>(initialState);

  const player = useAudioPlayer();
  const currentTrackIdRef = useRef<string | null>(null);
  const owningPathnameRef = useRef<string | null>(null);
  const mountedRef = useRef(true);

  const releaseAudioSession = useCallback(() => {
    void setAudioModeAsync(VOICE_NOTE_RELEASE_AUDIO_MODE).catch(() => undefined);
  }, []);

  const destroyPlayer = useCallback(async () => {
    currentTrackIdRef.current = null;
    try {
      player.pause();
    } catch {
      // Ignore teardown errors
    }
  }, [player]);

  const stop = useCallback(async () => {
    const wasActive = !!currentTrackIdRef.current;
    await destroyPlayer();
    owningPathnameRef.current = null;
    if (mountedRef.current) {
      setState(initialState);
    }
    if (wasActive) {
      releaseAudioSession();
    }
  }, [destroyPlayer, releaseAudioSession]);

  const stopRef = useRef(stop);
  useEffect(() => {
    stopRef.current = stop;
  }, [stop]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      void stopRef.current();
    };
  }, []);

  const pathname = usePathname();
  useEffect(() => {
    const owning = owningPathnameRef.current;
    if (!owning || !currentTrackIdRef.current) return;
    if (pathname === owning) return;
    void stopRef.current();
  }, [pathname]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (s: AppStateStatus) => {
      if (s === "background" || s === "inactive") {
        if (currentTrackIdRef.current) {
          void stopRef.current();
        }
      }
    });
    return () => sub.remove();
  }, []);

  // Update state from player status
  useEffect(() => {
    if (!mountedRef.current) return;
    
    setState((prev) => ({
      ...prev,
      isPlaying: player.playing,
      positionMs: player.currentTime * 1000,
      durationMs: player.duration * 1000,
    }));

    // Auto-stop when finished
    if (player.currentTime >= player.duration && player.duration > 0 && !player.playing) {
      void stopRef.current();
    }
  }, [player.playing, player.currentTime, player.duration]);

  const play = useCallback(
    async (track: { id: string; uri: string; durationMs?: number }) => {
      try {
        setState((prev) => ({ ...prev, isLoading: true, error: null }));

        // If playing a different track, tear down the old one
        if (currentTrackIdRef.current && currentTrackIdRef.current !== track.id) {
          await destroyPlayer();
        }

        // Set audio mode for exclusive playback
        await setAudioModeAsync(VOICE_NOTE_PLAYBACK_AUDIO_MODE);

        // If same track and playing, just resume
        if (currentTrackIdRef.current === track.id && player.isLoaded) {
          player.play();
          setState((prev) => ({ ...prev, isLoading: false, isPlaying: true }));
          return;
        }

        // Load new track
        player.replace(track.uri);
        player.play();
        currentTrackIdRef.current = track.id;
        owningPathnameRef.current = pathname;

        setState((prev) => ({
          ...prev,
          trackId: track.id,
          durationMs: track.durationMs || 0,
          isLoading: false,
          isPlaying: true,
          positionMs: 0,
          error: null,
        }));
      } catch (err) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: err instanceof Error ? err.message : "Failed to play audio",
        }));
        await destroyPlayer();
      }
    },
    [destroyPlayer, player, pathname]
  );

  const pause = useCallback(() => {
    try {
      player.pause();
      setState((prev) => ({ ...prev, isPlaying: false }));
    } catch (err) {
      setState((prev) => ({
        ...prev,
        error: err instanceof Error ? err.message : "Failed to pause",
      }));
    }
  }, [player]);

  const resume = useCallback(async () => {
    try {
      player.play();
      setState((prev) => ({ ...prev, isPlaying: true }));
    } catch (err) {
      setState((prev) => ({
        ...prev,
        error: err instanceof Error ? err.message : "Failed to resume",
      }));
    }
  }, [player]);

  const seekTo = useCallback(
    async (positionMs: number) => {
      try {
        player.seekTo(positionMs / 1000);
        setState((prev) => ({ ...prev, positionMs }));
      } catch (err) {
        setState((prev) => ({
          ...prev,
          error: err instanceof Error ? err.message : "Failed to seek",
        }));
      }
    },
    [player]
  );

  const value: AudioPlaybackApi = {
    ...state,
    play,
    pause,
    resume,
    seekTo,
    stop,
  };

  return (
    <AudioPlaybackContext.Provider value={value}>{children}</AudioPlaybackContext.Provider>
  );
}
