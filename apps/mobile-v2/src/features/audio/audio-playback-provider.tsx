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
// TODO(audio-port): Migrate from expo-av to expo-audio
// import { Audio, type AVPlaybackStatus } from "expo-av";

// Temporary stubs until audio migration
const Audio: any = {
  INTERRUPTION_MODE_IOS_DO_NOT_MIX: 1,
  INTERRUPTION_MODE_IOS_MIX_WITH_OTHERS: 0,
  INTERRUPTION_MODE_ANDROID_DO_NOT_MIX: 1,
  INTERRUPTION_MODE_ANDROID_DUCK_OTHERS: 2,
  Sound: class {
    static async createAsync(_source: any) {
      return { sound: new Audio.Sound(), status: {} };
    }
    async loadAsync() {}
    async playAsync() {}
    async pauseAsync() {}
    async stopAsync() {}
    async unloadAsync() {}
    async setPositionAsync(_pos: number) {}
    setOnPlaybackStatusUpdate(_callback: any) {}
  },
  setAudioModeAsync: async (_mode: any) => {},
};
type AVPlaybackStatus = any;

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
  allowsRecordingIOS: false,
  playsInSilentModeIOS: true,
  shouldDuckAndroid: false,
  interruptionModeIOS: Audio.INTERRUPTION_MODE_IOS_DO_NOT_MIX,
  interruptionModeAndroid: Audio.INTERRUPTION_MODE_ANDROID_DO_NOT_MIX,
};

const VOICE_NOTE_RELEASE_AUDIO_MODE = {
  allowsRecordingIOS: false,
  playsInSilentModeIOS: false,
  shouldDuckAndroid: true,
  interruptionModeIOS: Audio.INTERRUPTION_MODE_IOS_MIX_WITH_OTHERS,
  interruptionModeAndroid: Audio.INTERRUPTION_MODE_ANDROID_DUCK_OTHERS,
};

export function AudioPlaybackProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AudioPlaybackState>(initialState);

  // @ts-expect-error: Temporary Audio stub until expo-av → expo-audio migration
  const soundRef = useRef<Audio.Sound | null>(null);
  const currentTrackIdRef = useRef<string | null>(null);
  const owningPathnameRef = useRef<string | null>(null);
  const mountedRef = useRef(true);

  const releaseAudioSession = useCallback(() => {
    void Audio.setAudioModeAsync(VOICE_NOTE_RELEASE_AUDIO_MODE).catch(() => undefined);
  }, []);

  const destroySound = useCallback(async () => {
    const sound = soundRef.current;
    soundRef.current = null;
    currentTrackIdRef.current = null;
    if (sound) {
      try {
        await sound.setVolumeAsync(0);
        await sound.stopAsync();
        await sound.unloadAsync();
      } catch {
        // Ignore teardown errors
      }
    }
  }, []);

  const stop = useCallback(async () => {
    const wasActive = !!soundRef.current;
    await destroySound();
    owningPathnameRef.current = null;
    if (mountedRef.current) {
      setState(initialState);
    }
    if (wasActive) {
      releaseAudioSession();
    }
  }, [destroySound, releaseAudioSession]);

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
    if (!owning || !soundRef.current) return;
    if (pathname === owning) return;
    void stopRef.current();
  }, [pathname]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (s: AppStateStatus) => {
      if (s === "background" || s === "inactive") {
        if (soundRef.current) {
          void stopRef.current();
        }
      }
    });
    return () => sub.remove();
  }, []);

  const onPlaybackStatusUpdate = useCallback((status: AVPlaybackStatus) => {
    if (!mountedRef.current) return;
    if (!status.isLoaded) {
      if (status.error) {
        setState((prev) => ({ ...prev, error: status.error || "Playback error", isLoading: false }));
      }
      return;
    }
    setState((prev) => ({
      ...prev,
      isPlaying: status.isPlaying,
      isLoading: false,
      positionMs: status.positionMillis,
      durationMs: status.durationMillis || prev.durationMs,
      error: null,
    }));

    // Auto-stop when finished
    if (status.didJustFinish) {
      void stopRef.current();
    }
  }, []);

  const play = useCallback(
    async (track: { id: string; uri: string; durationMs?: number }) => {
      try {
        setState((prev) => ({ ...prev, isLoading: true, error: null }));

        // If playing a different track, tear down the old one
        if (currentTrackIdRef.current && currentTrackIdRef.current !== track.id) {
          await destroySound();
        }

        // Set audio mode for exclusive playback
        await Audio.setAudioModeAsync(VOICE_NOTE_PLAYBACK_AUDIO_MODE);

        // If same track, just resume
        if (currentTrackIdRef.current === track.id && soundRef.current) {
          await soundRef.current.playAsync();
          setState((prev) => ({ ...prev, isLoading: false, isPlaying: true }));
          return;
        }

        // Create new sound
        const { sound } = await Audio.Sound.createAsync(
          { uri: track.uri },
          { shouldPlay: true },
          onPlaybackStatusUpdate
        );
        soundRef.current = sound;
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
        await destroySound();
      }
    },
    [destroySound, onPlaybackStatusUpdate, pathname]
  );

  const pause = useCallback(async () => {
    const sound = soundRef.current;
    if (!sound) return;
    try {
      await sound.pauseAsync();
      setState((prev) => ({ ...prev, isPlaying: false }));
    } catch (err) {
      setState((prev) => ({
        ...prev,
        error: err instanceof Error ? err.message : "Failed to pause",
      }));
    }
  }, []);

  const resume = useCallback(async () => {
    const sound = soundRef.current;
    if (!sound) return;
    try {
      await sound.playAsync();
      setState((prev) => ({ ...prev, isPlaying: true }));
    } catch (err) {
      setState((prev) => ({
        ...prev,
        error: err instanceof Error ? err.message : "Failed to resume",
      }));
    }
  }, []);

  const seekTo = useCallback(async (positionMs: number) => {
    const sound = soundRef.current;
    if (!sound) return;
    try {
      await sound.setPositionAsync(positionMs);
      setState((prev) => ({ ...prev, positionMs }));
    } catch (err) {
      setState((prev) => ({
        ...prev,
        error: err instanceof Error ? err.message : "Failed to seek",
      }));
    }
  }, []);

  const value: AudioPlaybackApi = {
    ...state,
    play,
    pause,
    resume,
    seekTo,
    stop,
  };

  return (
    <AudioPlaybackContext.Provider value={value}>
      {children}
    </AudioPlaybackContext.Provider>
  );
}
