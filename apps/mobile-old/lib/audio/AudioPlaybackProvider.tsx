/**
 * Centralized voice-note playback (v2 — screen-scoped).
 *
 * Owns a single `expo-audio` `AudioPlayer` for the entire app so that:
 *   1. Starting a new voice note always stops the previous one — no
 *      overlapping audio when the user navigates between reports.
 *   2. Playback is scoped to the screen that started it. The provider
 *      records the pathname at the moment of `play()` and tears the
 *      player down whenever the pathname changes (navigation away),
 *      or the app goes to `background` / `inactive`.
 *   3. Music ducking is polite: while a voice note plays we use
 *      `interruptionMode: "doNotMix"` (pauses other apps' audio on
 *      iOS); when we stop, we flip to `mixWithOthers` +
 *      `playsInSilentMode: false` to release the exclusive audio
 *      session so iOS auto-resumes the user's music.
 *
 * Playback state (isPlaying / position / duration) is driven by a
 * `playbackStatusUpdate` listener — *not* polling. The previous polling
 * loop had a race where a tick landing immediately after `p.play()`
 * could observe `playing=false` (because expo-audio sets the flag
 * asynchronously) and write that into state, leaving the play/pause
 * button stuck on Play even though audio was running. The listener is
 * the only writer of `isPlaying`, so it can't desync.
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
import { AppState, type AppStateStatus } from "react-native";
import { usePathname } from "expo-router";
import {
  createAudioPlayer,
  setAudioModeAsync,
  type AudioPlayer,
  type AudioStatus,
} from "expo-audio";
import * as FileSystem from "expo-file-system/legacy";
import { getSignedUrl } from "@/lib/file-upload";
import { backend } from "@/lib/backend";
import {
  VOICE_NOTE_CACHE_DIR_NAME,
  toVoiceNoteCacheFilename,
} from "@/lib/voice-note-cache";
import { type FileMetadataRow } from "@/lib/file-upload";

const DOWNLOAD_OK_MIN = 200;
const DOWNLOAD_OK_MAX = 299;

/** Active audio mode while a voice note is playing. */
const VOICE_NOTE_PLAYBACK_AUDIO_MODE = {
  allowsRecording: false,
  playsInSilentMode: true,
  shouldPlayInBackground: false,
  interruptionMode: "doNotMix",
} as const;

/**
 * Audio mode applied on stop / finish / background. Switching to
 * `mixWithOthers` + `playsInSilentMode: false` releases the exclusive
 * audio session on iOS, which lets the system auto-resume any music
 * the user paused when our voice note started.
 */
const VOICE_NOTE_PLAYBACK_AUDIO_MODE_RELEASE = {
  allowsRecording: false,
  playsInSilentMode: false,
  shouldPlayInBackground: false,
  interruptionMode: "mixWithOthers",
} as const;

export type AudioPlaybackState = {
  /** storage_path of the file currently loaded in the player, or null. */
  activeStoragePath: string | null;
  /** Full row for the active file when known. */
  activeFile: FileMetadataRow | null;
  /** Display name of the recorder, when known. */
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
  /** Stop and unload the active player; releases audio session. */
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
  const listenerSubRef = useRef<{ remove: () => void } | null>(null);
  const mountedRef = useRef(true);
  /** Token bumped on each `play()` call so stale async work can be ignored. */
  const playTokenRef = useRef(0);
  /** Pathname at the moment of the last successful `play()`. */
  const owningPathnameRef = useRef<string | null>(null);
  /** Whether *something* is currently active (player loaded or loading). */
  const isActiveRef = useRef(false);

  const releaseAudioSession = useCallback(() => {
    // Best-effort: a failure here just means iOS holds the session a
    // moment longer; the next setAudioModeAsync will reconcile.
    void setAudioModeAsync(VOICE_NOTE_PLAYBACK_AUDIO_MODE_RELEASE).catch(
      () => undefined,
    );
  }, []);

  const detachListener = useCallback(() => {
    const sub = listenerSubRef.current;
    listenerSubRef.current = null;
    if (sub) {
      try {
        sub.remove();
      } catch {
        // Swallow — already removed by player teardown.
      }
    }
  }, []);

  const destroyPlayer = useCallback(() => {
    detachListener();
    const p = playerRef.current;
    playerRef.current = null;
    playerStoragePathRef.current = null;
    isActiveRef.current = false;
    if (p) {
      // expo-audio's `remove()` doesn't always halt audio that is
      // already buffered/playing — particularly when invoked mid-flight
      // (e.g. immediately after `play()` while the asset is still
      // attaching). If we skip pause(), the player can keep playing as
      // an orphan even though we've nulled our ref, and the next
      // `play()` will create a *second* player on top of it. Mute and
      // pause first, then remove, so the audio reliably halts.
      try {
        p.volume = 0;
      } catch {
        // swallow — volume setter may throw on torn-down players
      }
      try {
        p.pause();
      } catch {
        // swallow — pause may throw if the player was already removed
      }
      try {
        p.remove();
      } catch {
        // expo-audio occasionally throws if the player was already
        // removed by a fast unmount; swallow and continue.
      }
    }
  }, [detachListener]);

  const stop = useCallback(() => {
    const wasActive = isActiveRef.current || !!playerRef.current;
    destroyPlayer();
    owningPathnameRef.current = null;
    if (mountedRef.current) {
      setState(initialState);
    }
    if (wasActive) {
      releaseAudioSession();
    }
  }, [destroyPlayer, releaseAudioSession]);

  // Keep a ref to the latest stop() so listeners with stale closures can
  // call it without re-subscribing.
  const stopRef = useRef(stop);
  useEffect(() => {
    stopRef.current = stop;
  }, [stop]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      destroyPlayer();
    };
  }, [destroyPlayer]);

  // Auto-stop on screen change. usePathname() updates when the user
  // navigates; if it differs from the pathname captured at play() time
  // and we have something active, tear it down.
  const pathname = usePathname();
  useEffect(() => {
    const owning = owningPathnameRef.current;
    if (!owning) return;
    if (!isActiveRef.current && !playerRef.current) return;
    if (pathname === owning) return;
    stopRef.current();
  }, [pathname]);

  // Auto-stop when the app goes to background / inactive.
  useEffect(() => {
    const sub = AppState.addEventListener(
      "change",
      (s: AppStateStatus) => {
        if (s !== "background" && s !== "inactive") return;
        if (!isActiveRef.current && !playerRef.current) return;
        stopRef.current();
      },
    );
    return () => {
      try {
        sub.remove();
      } catch {
        // ignore
      }
    };
  }, []);

  const attachListener = useCallback(
    (p: AudioPlayer) => {
      detachListener();
      const sub = p.addListener("playbackStatusUpdate", (status: AudioStatus) => {
        if (!mountedRef.current) return;
        if (playerRef.current !== p) return; // stale subscription
        const finished = !!status.didJustFinish;
        setState((prev) => {
          const durationMs =
            status.duration && status.duration > 0
              ? Math.round(status.duration * 1000)
              : prev.durationMs;
          const positionMs =
            status.currentTime != null
              ? Math.round(status.currentTime * 1000)
              : prev.positionMs;
          return {
            ...prev,
            isPlaying: finished ? false : !!status.playing,
            isLoading: prev.isLoading && !status.isLoaded ? true : false,
            positionMs: finished ? 0 : positionMs,
            durationMs,
          };
        });
        if (finished) {
          // Natural end of track — release the session so the user's
          // music can auto-resume, and clear the active file.
          stopRef.current();
        }
      });
      listenerSubRef.current = sub as { remove: () => void };
    },
    [detachListener],
  );

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
        owningPathnameRef.current = pathname;
        isActiveRef.current = true;
        p.play();
        // Optimistically mark playing so the UI doesn't flicker between
        // tap and the first listener event. The listener will reconcile.
        if (mountedRef.current) {
          setState((s) => ({ ...s, isPlaying: true }));
        }
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
      isActiveRef.current = true;
      owningPathnameRef.current = pathname;

      try {
        await setAudioModeAsync(VOICE_NOTE_PLAYBACK_AUDIO_MODE);
        const audioUri = await getCachedAudioUri(storagePath);
        if (!mountedRef.current || token !== playTokenRef.current) return;
        if (!audioUri) return;

        const p = createAudioPlayer({ uri: audioUri });
        playerRef.current = p;
        playerStoragePathRef.current = storagePath;
        attachListener(p);

        p.play();
        if (mountedRef.current) {
          setState((s) => ({
            ...s,
            isLoading: false,
            isDownloading: false,
            // Optimistic — the listener will confirm or correct.
            isPlaying: true,
            durationMs:
              Math.round((p.duration ?? 0) * 1000) ||
              s.durationMs ||
              fallbackDurationMs ||
              0,
          }));
        }
      } catch (err) {
        if (!mountedRef.current || token !== playTokenRef.current) return;
        const message =
          err instanceof Error ? err.message : "Could not load audio";
        isActiveRef.current = false;
        owningPathnameRef.current = null;
        setState((s) => ({
          ...s,
          isLoading: false,
          isDownloading: false,
          isPlaying: false,
          error: message,
        }));
      }
    },
    [attachListener, destroyPlayer, getCachedAudioUri, pathname],
  );

  const pause = useCallback(() => {
    const p = playerRef.current;
    if (!p) return;
    p.pause();
    if (mountedRef.current) {
      setState((s) => ({ ...s, isPlaying: false }));
    }
  }, []);

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
    if (mountedRef.current) {
      setState((s) => ({ ...s, isPlaying: true }));
    }
  }, []);

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
