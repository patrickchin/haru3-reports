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

const mockRecord = vi.fn();
const mockStop = vi.fn();
const mockPrepareToRecordAsync = vi.fn();
const mockRequestPermissions = vi.fn().mockResolvedValue({ granted: true });
const mockSetAudioMode = vi.fn().mockResolvedValue(undefined);

vi.mock('expo-audio', () => ({
  useAudioRecorder: () => ({
    record: mockRecord,
    stop: mockStop,
    prepareToRecordAsync: mockPrepareToRecordAsync,
    uri: 'file:///tmp/recording.m4a',
  }),
  useAudioRecorderState: () => ({
    isRecording: false,
    durationMillis: 0,
    metering: null,
  }),
  RecordingPresets: {
    HIGH_QUALITY: { sampleRate: 44100, numberOfChannels: 2 },
  },
  setAudioModeAsync: mockSetAudioMode,
  requestRecordingPermissionsAsync: mockRequestPermissions,
}));

vi.mock('@/lib/state/observables', () => ({
  audio$: {
    isRecording: { set: vi.fn() },
    recordingDuration: { set: vi.fn() },
  },
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

const { useRecorder } = await import('../useRecorder');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useRecorder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stateStore = {};
    stateCounter = 0;
  });

  it('returns expected shape', () => {
    const result = useRecorder();
    expect(result).toHaveProperty('startRecording');
    expect(result).toHaveProperty('stopRecording');
    expect(result).toHaveProperty('isRecording');
    expect(result).toHaveProperty('duration');
    expect(result).toHaveProperty('amplitudes');
  });

  it('initially not recording', () => {
    const { isRecording, duration, amplitudes } = useRecorder();
    expect(isRecording).toBe(false);
    expect(duration).toBe(0);
    expect(amplitudes).toEqual([]);
  });

  it('startRecording requests permissions and starts recorder', async () => {
    const { startRecording } = useRecorder();
    await startRecording();

    expect(mockRequestPermissions).toHaveBeenCalled();
    expect(mockSetAudioMode).toHaveBeenCalledWith(
      expect.objectContaining({ allowsRecording: true }),
    );
    expect(mockPrepareToRecordAsync).toHaveBeenCalled();
    expect(mockRecord).toHaveBeenCalled();
  });

  it('startRecording throws when permission denied', async () => {
    mockRequestPermissions.mockResolvedValueOnce({ granted: false });

    const { startRecording } = useRecorder();
    await expect(startRecording()).rejects.toThrow('Microphone permission not granted');
  });

  it('stopRecording stops recorder and returns URI', async () => {
    mockStop.mockResolvedValueOnce(undefined);
    const { stopRecording } = useRecorder();

    const uri = await stopRecording();

    expect(mockStop).toHaveBeenCalled();
    expect(uri).toBe('file:///tmp/recording.m4a');
  });

  it('stopRecording restores audio mode for playback', async () => {
    mockStop.mockResolvedValueOnce(undefined);
    const { stopRecording } = useRecorder();

    await stopRecording();

    expect(mockSetAudioMode).toHaveBeenCalledWith(
      expect.objectContaining({ allowsRecording: false }),
    );
  });

  it('stopRecording returns null when recorder.stop() throws', async () => {
    mockStop.mockRejectedValueOnce(new Error('Stop failed'));
    const { stopRecording } = useRecorder();

    const uri = await stopRecording();
    expect(uri).toBeNull();
  });
});
