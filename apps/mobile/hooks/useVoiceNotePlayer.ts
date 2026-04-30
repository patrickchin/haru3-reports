import { useCallback, useEffect, useRef, useState } from "react";
import { createAudioPlayer, type AudioPlayer } from "expo-audio";
import * as FileSystem from "expo-file-system/legacy";
import { getSignedUrl } from "@/lib/file-upload";
import { backend } from "@/lib/backend";

export type VoiceNotePlayerState = {
  isLoading: boolean;
  isDownloading: boolean;
  isPlaying: boolean;
  positionMs: number;
  durationMs: number;
  error: string | null;
};

export type VoiceNotePlayer = VoiceNotePlayerState & {
  play: () => Promise<void>;
  pause: () => void;
  seekTo: (positionMs: number) => Promise<void>;
};

const VOICE_NOTE_CACHE_DIR_NAME = "voice-notes";
const DOWNLOAD_OK_MIN = 200;
const DOWNLOAD_OK_MAX = 299;

/**
 * Plays a voice note from Supabase Storage. Lazily downloads the file into
 * the app cache on first play, then drives an `expo-audio` player from the
 * local URI so subsequent plays start immediately.
 *
 * Designed for the VoiceNoteCard — one card has one player.
 */
export function useVoiceNotePlayer(
  storagePath: string | null | undefined,
  fallbackDurationMs: number | null = null,
): VoiceNotePlayer {
  const [state, setState] = useState<VoiceNotePlayerState>({
    isLoading: false,
    isDownloading: false,
    isPlaying: false,
    positionMs: 0,
    durationMs: fallbackDurationMs ?? 0,
    error: null,
  });

  const playerRef = useRef<AudioPlayer | null>(null);
  const playerPromiseRef = useRef<Promise<AudioPlayer | null> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (pollRef.current) clearInterval(pollRef.current);
      playerRef.current?.remove();
      playerRef.current = null;
    };
  }, []);

  const syncFromPlayer = useCallback((player: AudioPlayer) => {
    setState((s) => ({
      ...s,
      positionMs: Math.round((player.currentTime ?? 0) * 1000),
      durationMs: Math.round((player.duration ?? (s.durationMs / 1000)) * 1000),
      isPlaying: player.playing ?? false,
      isLoading: false,
    }));
  }, []);

  const getCachedAudioUri = useCallback(async (): Promise<string | null> => {
    if (!storagePath) return null;
    if (!FileSystem.cacheDirectory) {
      throw new Error("Audio cache is unavailable on this device");
    }

    const cacheDir = `${FileSystem.cacheDirectory}${VOICE_NOTE_CACHE_DIR_NAME}/`;
    const localUri = `${cacheDir}${toCacheFilename(storagePath)}`;
    const info = await FileSystem.getInfoAsync(localUri);
    if (info.exists) return "uri" in info && info.uri ? info.uri : localUri;

    if (mountedRef.current) {
      setState((s) => ({ ...s, isDownloading: true }));
    }
    await FileSystem.makeDirectoryAsync(cacheDir, { intermediates: true });
    const url = await getSignedUrl(backend, storagePath);
    const downloaded = await FileSystem.downloadAsync(url, localUri);
    if (!mountedRef.current) return null;
    if (downloaded.status < DOWNLOAD_OK_MIN || downloaded.status > DOWNLOAD_OK_MAX) {
      throw new Error(`Could not download audio (${downloaded.status})`);
    }
    return downloaded.uri;
  }, [storagePath]);

  const ensurePlayer = useCallback(async (): Promise<AudioPlayer | null> => {
    if (playerRef.current) return playerRef.current;
    if (playerPromiseRef.current) return playerPromiseRef.current;
    if (!storagePath) return null;

    setState((s) => ({ ...s, isLoading: true, isDownloading: false, error: null }));
    const playerPromise = (async () => {
      const audioUri = await getCachedAudioUri();
      if (!mountedRef.current) return null;
      if (!audioUri) return null;
      const p = createAudioPlayer({ uri: audioUri });
      playerRef.current = p;
      setState((s) => ({ ...s, isLoading: false, isDownloading: false }));
      return p;
    })();
    playerPromiseRef.current = playerPromise;

    try {
      return await playerPromise;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not load audio";
      if (mountedRef.current) {
        setState((s) => ({
          ...s,
          isLoading: false,
          isDownloading: false,
          isPlaying: false,
          error: message,
        }));
      }
      return null;
    } finally {
      playerPromiseRef.current = null;
    }
  }, [getCachedAudioUri, storagePath]);

  const startPolling = useCallback(() => {
    if (pollRef.current) return;
    pollRef.current = setInterval(() => {
      const p = playerRef.current;
      if (!p || !mountedRef.current) return;
      syncFromPlayer(p);
      if (!p.playing && pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    }, 200);
  }, [syncFromPlayer]);

  const play = useCallback(async () => {
    const p = await ensurePlayer();
    if (!p) return;
    p.play();
    syncFromPlayer(p);
    startPolling();
  }, [ensurePlayer, startPolling, syncFromPlayer]);

  const pause = useCallback(() => {
    const p = playerRef.current;
    if (!p) return;
    p.pause();
    syncFromPlayer(p);
  }, [syncFromPlayer]);

  const seekTo = useCallback(async (positionMs: number) => {
    const p = playerRef.current;
    if (!p) return;
    const durationMs = Math.round((p.duration ?? (state.durationMs / 1000)) * 1000);
    const clampedMs = clamp(positionMs, 0, durationMs > 0 ? durationMs : positionMs);
    await p.seekTo(clampedMs / 1000);
    setState((s) => ({ ...s, positionMs: clampedMs }));
  }, [state.durationMs]);

  return { ...state, play, pause, seekTo };
}

function toCacheFilename(storagePath: string): string {
  return storagePath.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
