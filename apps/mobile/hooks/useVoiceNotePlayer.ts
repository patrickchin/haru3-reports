/**
 * Per-card view of the global audio playback state.
 *
 * `useVoiceNotePlayer` is a thin selector over `AudioPlaybackProvider`.
 * Each `VoiceNoteCard` calls it with its own `storagePath`; the hook
 * returns playback state scoped to that file (so cards that aren't the
 * active one always see `isPlaying=false`, `positionMs=0`, etc.) and
 * forwards control calls to the global provider.
 *
 * This shape preserves the previous hook API so existing call sites
 * keep working without changes.
 */
import { useCallback, useMemo } from "react";
import { useAudioPlayback } from "@/lib/audio/AudioPlaybackProvider";
import { type FileMetadataRow } from "@/lib/file-upload";

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
  /** Eagerly download audio to disk cache for instant playback. */
  preload: () => Promise<void>;
};

export type UseVoiceNotePlayerOptions = {
  /** Full row, used by the MiniPlayer to show "now playing" metadata. */
  file?: FileMetadataRow | null;
  /** Display name shown in the MiniPlayer; null hides it. */
  authorName?: string | null;
  /** Duration to show before the player has loaded. */
  fallbackDurationMs?: number | null;
};

/**
 * Hook signature accepts both:
 *   useVoiceNotePlayer(storagePath, fallbackDurationMs)   // legacy
 *   useVoiceNotePlayer(storagePath, { file, authorName }) // preferred
 */
export function useVoiceNotePlayer(
  storagePath: string | null | undefined,
  optionsOrFallback?: UseVoiceNotePlayerOptions | number | null,
): VoiceNotePlayer {
  const ctx = useAudioPlayback();

  const options: UseVoiceNotePlayerOptions =
    typeof optionsOrFallback === "object" && optionsOrFallback !== null
      ? optionsOrFallback
      : { fallbackDurationMs: optionsOrFallback ?? null };

  const isActive = !!storagePath && ctx.activeStoragePath === storagePath;

  const play = useCallback(async () => {
    if (!storagePath) return;
    await ctx.play({
      storagePath,
      file: options.file ?? null,
      authorName: options.authorName ?? null,
      fallbackDurationMs: options.fallbackDurationMs ?? null,
    });
  }, [
    ctx,
    storagePath,
    options.file,
    options.authorName,
    options.fallbackDurationMs,
  ]);

  const pause = useCallback(() => {
    if (!isActive) return;
    ctx.pause();
  }, [ctx, isActive]);

  const seekTo = useCallback(
    async (ms: number) => {
      if (!isActive) return;
      await ctx.seekTo(ms);
    },
    [ctx, isActive],
  );

  const preload = useCallback(async () => {
    if (!storagePath) return;
    await ctx.preload(storagePath);
  }, [ctx, storagePath]);

  return useMemo<VoiceNotePlayer>(
    () => ({
      isLoading: isActive ? ctx.isLoading : false,
      isDownloading: isActive ? ctx.isDownloading : false,
      isPlaying: isActive ? ctx.isPlaying : false,
      positionMs: isActive ? ctx.positionMs : 0,
      durationMs: isActive
        ? ctx.durationMs || options.fallbackDurationMs || 0
        : options.fallbackDurationMs ?? 0,
      error: isActive ? ctx.error : null,
      play,
      pause,
      seekTo,
      preload,
    }),
    [
      isActive,
      ctx.isLoading,
      ctx.isDownloading,
      ctx.isPlaying,
      ctx.positionMs,
      ctx.durationMs,
      ctx.error,
      options.fallbackDurationMs,
      play,
      pause,
      seekTo,
      preload,
    ],
  );
}
