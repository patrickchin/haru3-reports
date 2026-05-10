import { useCallback, useEffect, useRef, useState } from 'react';
import { Audio } from 'expo-av';
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
  const soundRef = useRef<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);

  // Cleanup on unmount or when fileUrl changes
  useEffect(() => {
    return () => {
      soundRef.current?.unloadAsync().catch(() => {});
      soundRef.current = null;

      // Clear global observable if this file was playing
      if (audio$.playingFileId.peek() === fileId) {
        audio$.playingFileId.set(null);
        audio$.playbackPosition.set(0);
      }
    };
  }, [fileUrl, fileId]);

  const ensureLoaded = useCallback(async (): Promise<Audio.Sound> => {
    if (soundRef.current) return soundRef.current;

    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      shouldDuckAndroid: true,
    });

    const { sound } = await Audio.Sound.createAsync(
      { uri: fileUrl },
      { shouldPlay: false },
      (status) => {
        if (!status.isLoaded) return;
        setPosition(status.positionMillis / 1000);
        setDuration((status.durationMillis ?? 0) / 1000);
        audio$.playbackPosition.set(status.positionMillis / 1000);

        if (status.didJustFinish) {
          setIsPlaying(false);
          audio$.playingFileId.set(null);
          audio$.playbackPosition.set(0);
        }
      },
    );

    soundRef.current = sound;
    return sound;
  }, [fileUrl, fileId]);

  const play = useCallback(async () => {
    const sound = await ensureLoaded();
    await sound.playAsync();
    setIsPlaying(true);
    audio$.playingFileId.set(fileId);
  }, [ensureLoaded, fileId]);

  const pause = useCallback(async () => {
    await soundRef.current?.pauseAsync();
    setIsPlaying(false);
  }, []);

  const stop = useCallback(async () => {
    await soundRef.current?.stopAsync();
    setIsPlaying(false);
    setPosition(0);
    audio$.playingFileId.set(null);
    audio$.playbackPosition.set(0);
  }, []);

  return { play, pause, stop, isPlaying, position, duration };
}
