import { useCallback, useEffect, useRef, useState } from "react";
import { createAudioPlayer, type AudioPlayer } from "expo-audio";
import { getSignedUrl } from "@/lib/file-upload";
import { backend } from "@/lib/backend";

export type VoiceNotePlayerState = {
  isLoading: boolean;
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

/**
 * Plays a voice note from Supabase Storage. Lazily fetches a signed URL
 * the first time `play()` is called, then drives an `expo-audio` player.
 *
 * Designed for the VoiceNoteCard — one card has one player.
 */
export function useVoiceNotePlayer(
  storagePath: string | null | undefined,
  fallbackDurationMs: number | null = null,
): VoiceNotePlayer {
  const [state, setState] = useState<VoiceNotePlayerState>({
    isLoading: false,
    isPlaying: false,
    positionMs: 0,
    durationMs: fallbackDurationMs ?? 0,
    error: null,
  });

  const playerRef = useRef<AudioPlayer | null>(null);
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

  const ensurePlayer = useCallback(async (): Promise<AudioPlayer | null> => {
    if (playerRef.current) return playerRef.current;
    if (!storagePath) return null;

    setState((s) => ({ ...s, isLoading: true, error: null }));
    try {
      const url = await getSignedUrl(backend, storagePath);
      if (!mountedRef.current) return null;
      const p = createAudioPlayer({ uri: url });
      playerRef.current = p;
      setState((s) => ({ ...s, isLoading: false }));
      return p;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not load audio";
      if (mountedRef.current) {
        setState((s) => ({ ...s, isLoading: false, error: message }));
      }
      return null;
    }
  }, [storagePath]);

  const startPolling = useCallback(() => {
    if (pollRef.current) return;
    pollRef.current = setInterval(() => {
      const p = playerRef.current;
      if (!p || !mountedRef.current) return;
      setState((s) => ({
        ...s,
        positionMs: Math.round((p.currentTime ?? 0) * 1000),
        durationMs: Math.round((p.duration ?? (s.durationMs / 1000)) * 1000),
        isPlaying: p.playing ?? false,
      }));
      if (!p.playing && pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    }, 200);
  }, []);

  const play = useCallback(async () => {
    const p = await ensurePlayer();
    if (!p) return;
    p.play();
    setState((s) => ({ ...s, isPlaying: true }));
    startPolling();
  }, [ensurePlayer, startPolling]);

  const pause = useCallback(() => {
    playerRef.current?.pause();
    setState((s) => ({ ...s, isPlaying: false }));
  }, []);

  const seekTo = useCallback(async (positionMs: number) => {
    const p = playerRef.current;
    if (!p) return;
    await p.seekTo(positionMs / 1000);
    setState((s) => ({ ...s, positionMs }));
  }, []);

  return { ...state, play, pause, seekTo };
}
