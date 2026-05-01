/**
 * Centralized voice-note playback.
 *
 * Owns a single `expo-audio` `AudioPlayer` for the entire app so that:
 *   1. Starting a new voice note always stops the previous one — no
 *      overlapping audio when the user navigates between reports.
 *   2. The MiniPlayer (mounted globally in `_layout.tsx`) always shows
 *      what's currently playing, regardless of which screen the user is
 *      on, with controls to pause / dismiss.
 *   3. Background playback continues (`shouldPlayInBackground: true`)
 *      because users explicitly asked for it. Lock-screen / Control
 *      Center remote controls require a media-session-aware player
 *      (e.g. `react-native-track-player`); see TODO at the bottom of
 *      this file.
 *
 * The previous implementation kept a per-card `AudioPlayer` plus a
 * module-level `let activeVoiceNotePlayback` to coordinate them. That
 * pattern leaked playback when cards unmounted (navigation away), and
 * couldn't surface a global "now playing" UI because no component
 * outside the source card knew what was playing.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from "expo-audio";
import * as FileSystem from "expo-file-system/legacy";
import { getSignedUrl } from "@/lib/file-upload";
import { backend } from "@/lib/backend";
import {
  VOICE_NOTE_CACHE_DIR_NAME,
  toVoiceNoteCacheFilename,
} from "@/lib/voice-note-cache";
import { type FileMetadataRow } from "@/lib/file-upload";

const POLL_INTERVAL_MS = 200;
const DOWNLOAD_OK_MIN = 200;
const DOWNLOAD_OK_MAX = 299;

const VOICE_NOTE_PLAYBACK_AUDIO_MODE = {
  allowsRecording: false,
  playsInSilentMode: true,
  shouldPlayInBackground: true,
  interruptionMode: "doNotMix",
} as const;

export type AudioPlaybackState = {
  /** storage_path of the file currently loaded in the player, or null. */
  activeStoragePath: string | null;
  /** Full row for the active file when known — used by the MiniPlayer. */
  activeFile: FileMetadataRow | null;
  /** Display name to show in the MiniPlayer; null hides it. */
  activeAuthorName: string | null;
  isPlaying: boolean;
  isLoading: boolean;
  isDownloading: boolean;
  positionMs: number;
  durationMs: number;
  error: string | null;
};

export type PlayInput = {
  storagePath: string;
  fallbackDurationMs?: number | null;
  file?: FileMetadataRow | null;
  authorName?: string | null;
};

export type AudioPlaybackContextValue = AudioPlaybackState & {
  play: (input: PlayInput) => Promise<void>;
  pause: () => void;
  /** Resume the active file from its current position. No-op if nothing loaded. */
  resume: () => Promise<void>;
  seekTo: (positionMs: number) => Promise<void>;
  /** Stop and unload the active player; clears MiniPlayer. */
  stop: () => void;
  /** Eagerly download a file into the disk cache without creating a player. */
  preload: (storagePath: string) => Promise<void>;
};

const initialState: AudioPlaybackState = {
  activeStoragePath: null,
  activeFile: null,
  activeAuthorName: null,
  isPlaying: false,
  isLoading: false,
  isDownloading: false,
  positionMs: 0,
  durationMs: 0,
  error: null,
};

const AudioPlaybackContext = createContext<AudioPlaybackContextValue | null>(null);

export function useAudioPlayback(): AudioPlaybackContextValue {
  const ctx = useContext(AudioPlaybackContext);
  if (!ctx) {
    throw new Error(
      "useAudioPlayback must be used inside an <AudioPlaybackProvider>",
    );
  }
  return ctx;
}

export function AudioPlaybackProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AudioPlaybackState>(initialState);

  const playerRef = useRef<AudioPlayer | null>(null);
  const playerStoragePathRef = useRef<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);
  /** Token bumped on each `play()` call so stale async work can be ignored. */
  const playTokenRef = useRef(0);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const destroyPlayer = useCallback(() => {
    stopPolling();
    const p = playerRef.current;
    playerRef.current = null;
    playerStoragePathRef.current = null;
    if (p) {
      try {
        p.remove();
      } catch {
        // expo-audio occasionally throws if the player was already removed
        // by a fast unmount; swallow and continue.
      }
    }
  }, [stopPolling]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      destroyPlayer();
    };
  }, [destroyPlayer]);

  const syncFromPlayer = useCallback((player: AudioPlayer) => {
    if (!mountedRef.current) return;
    const isPlaying = player.playing ?? false;
    setState((s) => ({
      ...s,
      positionMs: Math.round((player.currentTime ?? 0) * 1000),
      durationMs: Math.round(
        (player.duration ?? s.durationMs / 1000) * 1000,
      ),
      isPlaying,
      isLoading: false,
    }));
  }, []);

  const startPolling = useCallback(() => {
    if (pollRef.current) return;
    pollRef.current = setInterval(() => {
      const p = playerRef.current;
      if (!p || !mountedRef.current) return;
      syncFromPlayer(p);
      if (!p.playing && pollRef.current) {
        stopPolling();
      }
    }, POLL_INTERVAL_MS);
  }, [stopPolling, syncFromPlayer]);

  const getCachedAudioUri = useCallback(
    async (storagePath: string): Promise<string | null> => {
      if (!FileSystem.cacheDirectory) {
        throw new Error("Audio cache is unavailable on this device");
      }
      const cacheDir = `${FileSystem.cacheDirectory}${VOICE_NOTE_CACHE_DIR_NAME}/`;
      const localUri = `${cacheDir}${toVoiceNoteCacheFilename(storagePath)}`;
      const info = await FileSystem.getInfoAsync(localUri);
      if (info.exists) return "uri" in info && info.uri ? info.uri : localUri;

      if (mountedRef.current) {
        setState((s) => ({ ...s, isDownloading: true }));
      }
      await FileSystem.makeDirectoryAsync(cacheDir, { intermediates: true });
      const url = await getSignedUrl(backend, storagePath);
      const downloaded = await FileSystem.downloadAsync(url, localUri);
      if (!mountedRef.current) return null;
      if (
        downloaded.status < DOWNLOAD_OK_MIN ||
        downloaded.status > DOWNLOAD_OK_MAX
      ) {
        throw new Error(`Could not download audio (${downloaded.status})`);
      }
      return downloaded.uri;
    },
    [],
  );

  const preload = useCallback(
    async (storagePath: string) => {
      if (!storagePath) return;
      try {
        await getCachedAudioUri(storagePath);
        if (mountedRef.current) {
          setState((s) => ({ ...s, isDownloading: false }));
        }
      } catch {
        // Best-effort: a failed preload just means the first play will
        // download instead. Don't surface this as an error.
        if (mountedRef.current) {
          setState((s) => ({ ...s, isDownloading: false }));
        }
      }
    },
    [getCachedAudioUri],
  );

  const play = useCallback(
    async (input: PlayInput) => {
      const { storagePath, fallbackDurationMs, file, authorName } = input;
      if (!storagePath) return;

      const token = ++playTokenRef.current;

      // If the same file is already loaded, just resume it.
      if (
        playerRef.current &&
        playerStoragePathRef.current === storagePath
      ) {
        const p = playerRef.current;
        try {
          await setAudioModeAsync(VOICE_NOTE_PLAYBACK_AUDIO_MODE);
        } catch (err) {
          if (mountedRef.current) {
            setState((s) => ({
              ...s,
              error:
                err instanceof Error
                  ? err.message
                  : "Could not configure audio playback",
            }));
          }
          return;
        }
        const duration = p.duration ?? 0;
        if (duration > 0 && p.currentTime >= duration) {
          p.seekTo(0);
        }
        p.play();
        syncFromPlayer(p);
        startPolling();
        return;
      }

      // Different file (or none) — tear down any current player first.
      destroyPlayer();

      if (mountedRef.current) {
        setState({
          activeStoragePath: storagePath,
          activeFile: file ?? null,
          activeAuthorName: authorName ?? null,
          isPlaying: false,
          isLoading: true,
          isDownloading: false,
          positionMs: 0,
          durationMs: fallbackDurationMs ?? 0,
          error: null,
        });
      }

      try {
        await setAudioModeAsync(VOICE_NOTE_PLAYBACK_AUDIO_MODE);
        const audioUri = await getCachedAudioUri(storagePath);
        if (!mountedRef.current || token !== playTokenRef.current) return;
        if (!audioUri) return;

        const p = createAudioPlayer({ uri: audioUri });
        playerRef.current = p;
        playerStoragePathRef.current = storagePath;

        p.play();
        if (mountedRef.current) {
          setState((s) => ({
            ...s,
            isLoading: false,
            isDownloading: false,
            isPlaying: true,
            durationMs:
              Math.round((p.duration ?? 0) * 1000) ||
              s.durationMs ||
              fallbackDurationMs ||
              0,
          }));
        }
        startPolling();
      } catch (err) {
        if (!mountedRef.current || token !== playTokenRef.current) return;
        const message =
          err instanceof Error ? err.message : "Could not load audio";
        setState((s) => ({
          ...s,
          isLoading: false,
          isDownloading: false,
          isPlaying: false,
          error: message,
        }));
      }
    },
    [destroyPlayer, getCachedAudioUri, startPolling, syncFromPlayer],
  );

  const pause = useCallback(() => {
    const p = playerRef.current;
    if (!p) return;
    p.pause();
    syncFromPlayer(p);
    stopPolling();
  }, [stopPolling, syncFromPlayer]);

  const resume = useCallback(async () => {
    const p = playerRef.current;
    if (!p) return;
    try {
      await setAudioModeAsync(VOICE_NOTE_PLAYBACK_AUDIO_MODE);
    } catch (err) {
      if (mountedRef.current) {
        setState((s) => ({
          ...s,
          error:
            err instanceof Error
              ? err.message
              : "Could not configure audio playback",
        }));
      }
      return;
    }
    const duration = p.duration ?? 0;
    if (duration > 0 && p.currentTime >= duration) {
      p.seekTo(0);
    }
    p.play();
    syncFromPlayer(p);
    startPolling();
  }, [startPolling, syncFromPlayer]);

  const seekTo = useCallback(async (positionMs: number) => {
    const p = playerRef.current;
    if (!p) return;
    const durationSec = p.duration ?? 0;
    const clampedMs = clamp(
      positionMs,
      0,
      durationSec > 0 ? Math.round(durationSec * 1000) : positionMs,
    );
    await p.seekTo(clampedMs / 1000);
    if (mountedRef.current) {
      setState((s) => ({ ...s, positionMs: clampedMs }));
    }
  }, []);

  const stop = useCallback(() => {
    destroyPlayer();
    if (mountedRef.current) {
      setState(initialState);
    }
  }, [destroyPlayer]);

  const value = useMemo<AudioPlaybackContextValue>(
    () => ({
      ...state,
      play,
      pause,
      resume,
      seekTo,
      stop,
      preload,
    }),
    [state, play, pause, resume, seekTo, stop, preload],
  );

  return (
    <AudioPlaybackContext.Provider value={value}>
      {children}
    </AudioPlaybackContext.Provider>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

// TODO(voice-note-bg-controls): Background playback works
// (`shouldPlayInBackground: true`) but iOS Control Center / Android
// notification controls require a media-session-aware player. The
// cleanest path is `react-native-track-player`, which provides
// MPNowPlayingInfoCenter + MediaSession + foreground service in one
// package. When we add it, swap the `expo-audio` calls in this provider
// for TrackPlayer calls and surface play/pause/seek through its remote
// command listeners.
