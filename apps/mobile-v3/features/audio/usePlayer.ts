import { useCallback, useEffect, useRef, useState } from 'react';
import {
  useAudioPlayer,
  useAudioPlayerStatus,
  setAudioModeAsync,
} from 'expo-audio';
import { audio$ } from '@/lib/state/observables';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UsePlayerResult {
  play: () => Promise<void>;
  pause: () => Promise<void>;
  stop: () => Promise<void>;
  isPlaying: boolean;
  position: number;
  duration: number;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function usePlayer(fileUrl: string, fileId: string): UsePlayerResult {
  const player = useAudioPlayer(fileUrl, { updateInterval: 0.1 });
  const status = useAudioPlayerStatus(player);

  const prevFinished = useRef(false);

  // Sync status to observable state
  useEffect(() => {
    if (status.playing) {
      audio$.playbackPosition.set(status.currentTime);
    }

    // Detect playback finished (was playing, now not playing and reached end)
    const finished = !status.playing && status.currentTime >= status.duration && status.duration > 0;
    if (finished && !prevFinished.current) {
      audio$.playingFileId.set(null);
      audio$.playbackPosition.set(0);
    }
    prevFinished.current = finished;
  }, [status.playing, status.currentTime, status.duration]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audio$.playingFileId.peek() === fileId) {
        audio$.playingFileId.set(null);
        audio$.playbackPosition.set(0);
      }
    };
  }, [fileId]);

  const play = useCallback(async () => {
    await setAudioModeAsync({
      playsInSilentMode: true,
      interruptionMode: 'duckOthers',
    });
    player.play();
    audio$.playingFileId.set(fileId);
  }, [player, fileId]);

  const pause = useCallback(async () => {
    player.pause();
  }, [player]);

  const stop = useCallback(async () => {
    player.pause();
    player.seekTo(0);
    audio$.playingFileId.set(null);
    audio$.playbackPosition.set(0);
  }, [player]);

  return {
    play,
    pause,
    stop,
    isPlaying: status.playing,
    position: status.currentTime,
    duration: status.duration,
  };
}
