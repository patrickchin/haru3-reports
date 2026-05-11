import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock React hooks to work outside component context
// ---------------------------------------------------------------------------

let stateStore: Record<number, any> = {};
let stateCounter = 0;

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  return {
    ...actual,
    useState: (init: any) => {
      const idx = stateCounter++;
      if (!(idx in stateStore)) stateStore[idx] = init;
      return [stateStore[idx], (v: any) => { stateStore[idx] = typeof v === 'function' ? v(stateStore[idx]) : v; }];
    },
    useRef: (init: any) => ({ current: init }),
    useCallback: (fn: any) => fn,
    useEffect: () => {},
  };
});

// ---------------------------------------------------------------------------
// Mocks for expo-audio
// ---------------------------------------------------------------------------

const mockPlay = vi.fn();
const mockPause = vi.fn();
const mockSeekTo = vi.fn();

const mockStatus = {
  playing: false,
  currentTime: 0,
  duration: 120,
};

vi.mock('expo-audio', () => ({
  useAudioPlayer: () => ({
    play: mockPlay,
    pause: mockPause,
    seekTo: mockSeekTo,
  }),
  useAudioPlayerStatus: () => mockStatus,
  setAudioModeAsync: vi.fn().mockResolvedValue(undefined),
}));

const mockAudio$ = {
  playingFileId: { set: vi.fn(), peek: vi.fn(() => null) },
  playbackPosition: { set: vi.fn() },
};

vi.mock('@/lib/state/observables', () => ({
  audio$: mockAudio$,
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

const { usePlayer } = await import('../usePlayer');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('usePlayer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stateStore = {};
    stateCounter = 0;
    mockStatus.playing = false;
    mockStatus.currentTime = 0;
    mockStatus.duration = 120;
  });

  it('returns expected shape', () => {
    const result = usePlayer('https://example.com/audio.m4a', 'f1');
    expect(result).toHaveProperty('play');
    expect(result).toHaveProperty('pause');
    expect(result).toHaveProperty('stop');
    expect(result).toHaveProperty('seekTo');
    expect(result).toHaveProperty('isPlaying');
    expect(result).toHaveProperty('position');
    expect(result).toHaveProperty('duration');
  });

  it('initially not playing', () => {
    const { isPlaying, position } = usePlayer('https://example.com/audio.m4a', 'f1');
    expect(isPlaying).toBe(false);
    expect(position).toBe(0);
  });

  it('reports duration from player status', () => {
    mockStatus.duration = 60;
    const { duration } = usePlayer('https://example.com/audio.m4a', 'f1');
    expect(duration).toBe(60);
  });

  it('play sets audio mode and calls player.play', async () => {
    const { setAudioModeAsync } = await import('expo-audio');
    const { play } = usePlayer('https://example.com/audio.m4a', 'f1');

    await play();

    expect(setAudioModeAsync).toHaveBeenCalledWith(
      expect.objectContaining({ playsInSilentMode: true }),
    );
    expect(mockPlay).toHaveBeenCalled();
    expect(mockAudio$.playingFileId.set).toHaveBeenCalledWith('f1');
  });

  it('pause calls player.pause', async () => {
    const { pause } = usePlayer('https://example.com/audio.m4a', 'f1');
    await pause();
    expect(mockPause).toHaveBeenCalled();
  });

  it('stop pauses, seeks to 0, and resets observable', async () => {
    const { stop } = usePlayer('https://example.com/audio.m4a', 'f1');
    await stop();

    expect(mockPause).toHaveBeenCalled();
    expect(mockSeekTo).toHaveBeenCalledWith(0);
    expect(mockAudio$.playingFileId.set).toHaveBeenCalledWith(null);
    expect(mockAudio$.playbackPosition.set).toHaveBeenCalledWith(0);
  });

  it('seekTo calls player.seekTo and updates observable', () => {
    const { seekTo } = usePlayer('https://example.com/audio.m4a', 'f1');
    seekTo(30);

    expect(mockSeekTo).toHaveBeenCalledWith(30);
    expect(mockAudio$.playbackPosition.set).toHaveBeenCalledWith(30);
  });

  it('reflects playing state from status', () => {
    mockStatus.playing = true;
    mockStatus.currentTime = 15;
    const { isPlaying, position } = usePlayer('https://example.com/audio.m4a', 'f1');
    expect(isPlaying).toBe(true);
    expect(position).toBe(15);
  });
});
