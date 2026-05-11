import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock React hooks to work outside component context
// ---------------------------------------------------------------------------

let stateStore: Record<number, any> = {};
let stateCounter = 0;
let refStore: Record<number, { current: any }> = {};
let refCounter = 0;

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  return {
    ...actual,
    useState: (init: any) => {
      const idx = stateCounter++;
      if (!(idx in stateStore)) stateStore[idx] = init;
      return [stateStore[idx], (v: any) => { stateStore[idx] = typeof v === 'function' ? v(stateStore[idx]) : v; }];
    },
    useRef: (init: any) => {
      const idx = refCounter++;
      if (!(idx in refStore)) refStore[idx] = { current: init };
      return refStore[idx];
    },
    useCallback: (fn: any) => fn,
    useEffect: () => {},
  };
});

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockStartRecording = vi.fn();
const mockStopRecording = vi.fn();

vi.mock('@/features/audio/AudioProvider', () => ({
  useAudio: () => ({
    startRecording: mockStartRecording,
    stopRecording: mockStopRecording,
    isRecording: false,
    amplitudes: [],
  }),
}));

const mockPresignMutateAsync = vi.fn();
const mockCreateFileMutateAsync = vi.fn();
const mockTranscribeMutateAsync = vi.fn();
const mockCreateNoteMutateAsync = vi.fn();

let mockPresignIsError = false;
let mockCreateFileIsError = false;
let mockTranscribeIsError = false;

vi.mock('@/lib/api/hooks', () => ({
  usePresignUpload: () => ({ mutateAsync: mockPresignMutateAsync, get isError() { return mockPresignIsError; } }),
  useCreateFile: () => ({ mutateAsync: mockCreateFileMutateAsync, get isError() { return mockCreateFileIsError; } }),
  useTranscribe: () => ({ mutateAsync: mockTranscribeMutateAsync, get isError() { return mockTranscribeIsError; } }),
  useCreateNote: () => ({ mutateAsync: mockCreateNoteMutateAsync, isError: false }),
}));

vi.mock('expo-file-system', () => ({
  File: class MockFile {
    uri: string;
    exists = true;
    size = 1024;
    constructor(uri: string) { this.uri = uri; }
  },
}));

// Mock global fetch for upload
const mockFetch = vi.fn().mockResolvedValue({
  blob: () => Promise.resolve(new Blob()),
});
global.fetch = mockFetch;

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

const { useVoiceNotePipeline } = await import('../useVoiceNotePipeline');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resetState() {
  stateStore = {};
  stateCounter = 0;
  refStore = {};
  refCounter = 0;
}

function setupSuccessfulPipeline() {
  mockPresignMutateAsync.mockResolvedValue({
    signedUrl: 'https://s3/signed',
    storagePath: 'voice/abc.m4a',
  });
  mockFetch.mockResolvedValue({ blob: () => Promise.resolve(new Blob()) });
  mockCreateFileMutateAsync.mockResolvedValue({ id: 'file-1' });
  mockTranscribeMutateAsync.mockResolvedValue({ transcript: 'Hello world' });
  mockCreateNoteMutateAsync.mockResolvedValue({ id: 'note-1' });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useVoiceNotePipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetState();
    mockPresignIsError = false;
    mockCreateFileIsError = false;
    mockTranscribeIsError = false;
    mockFetch.mockResolvedValue({ blob: () => Promise.resolve(new Blob()) });
  });

  it('returns expected shape', () => {
    const result = useVoiceNotePipeline('r1', 'p1');
    expect(result).toHaveProperty('startRecording');
    expect(result).toHaveProperty('stopRecording');
    expect(result).toHaveProperty('isRecording');
    expect(result).toHaveProperty('amplitudes');
    expect(result).toHaveProperty('pendingNotes');
    expect(result).toHaveProperty('retry');
    expect(typeof result.startRecording).toBe('function');
    expect(typeof result.stopRecording).toBe('function');
    expect(typeof result.retry).toBe('function');
  });

  it('startRecording delegates to audio.startRecording', async () => {
    const { startRecording } = useVoiceNotePipeline('r1', 'p1');
    await startRecording();
    expect(mockStartRecording).toHaveBeenCalledTimes(1);
  });

  it('stopRecording delegates to audio.stopRecording', async () => {
    mockStopRecording.mockResolvedValueOnce(null);
    const { stopRecording } = useVoiceNotePipeline('r1', 'p1');
    await stopRecording();
    expect(mockStopRecording).toHaveBeenCalledTimes(1);
  });

  it('stopRecording does not start pipeline when uri is null', async () => {
    mockStopRecording.mockResolvedValueOnce(null);
    const { stopRecording } = useVoiceNotePipeline('r1', 'p1');
    await stopRecording();
    expect(mockPresignMutateAsync).not.toHaveBeenCalled();
  });

  it('stopRecording triggers pipeline when uri is returned', async () => {
    setupSuccessfulPipeline();
    mockStopRecording.mockResolvedValueOnce('file:///tmp/voice.m4a');

    const { stopRecording } = useVoiceNotePipeline('r1', 'p1');
    await stopRecording();

    // Pipeline is fire-and-forget, wait for it
    await vi.waitFor(() => {
      expect(mockPresignMutateAsync).toHaveBeenCalled();
    });
  });

  it('pipeline calls presign → createFile → transcribe → createNote in order', async () => {
    setupSuccessfulPipeline();
    mockStopRecording.mockResolvedValueOnce('file:///tmp/voice.m4a');

    const { stopRecording } = useVoiceNotePipeline('r1', 'p1');
    await stopRecording();

    await vi.waitFor(() => {
      expect(mockCreateNoteMutateAsync).toHaveBeenCalled();
    });

    expect(mockPresignMutateAsync).toHaveBeenCalledWith({
      fileName: expect.stringContaining('voice-'),
      mimeType: 'audio/m4a',
      category: 'voice',
    });

    expect(mockCreateFileMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'p1',
        reportId: 'r1',
        storagePath: 'voice/abc.m4a',
        category: 'voice',
        mimeType: 'audio/m4a',
      }),
    );

    expect(mockTranscribeMutateAsync).toHaveBeenCalledWith('file-1');

    expect(mockCreateNoteMutateAsync).toHaveBeenCalledWith({
      reportId: 'r1',
      kind: 'voice',
      body: 'Hello world',
      fileId: 'file-1',
    });
  });

  it('handles upload failure gracefully', async () => {
    mockPresignMutateAsync.mockRejectedValueOnce(new Error('Upload failed'));
    mockPresignIsError = true;
    mockStopRecording.mockResolvedValueOnce('file:///tmp/voice.m4a');

    const { stopRecording } = useVoiceNotePipeline('r1', 'p1');
    await stopRecording();

    await vi.waitFor(() => {
      expect(mockPresignMutateAsync).toHaveBeenCalled();
    });

    // Should not proceed to transcribe
    expect(mockTranscribeMutateAsync).not.toHaveBeenCalled();
  });

  it('handles transcribe failure gracefully', async () => {
    mockPresignMutateAsync.mockResolvedValue({
      signedUrl: 'https://s3/signed',
      storagePath: 'voice/abc.m4a',
    });
    mockCreateFileMutateAsync.mockResolvedValue({ id: 'file-1' });
    mockTranscribeMutateAsync.mockRejectedValueOnce(new Error('Transcribe failed'));
    mockTranscribeIsError = true;
    mockStopRecording.mockResolvedValueOnce('file:///tmp/voice.m4a');

    const { stopRecording } = useVoiceNotePipeline('r1', 'p1');
    await stopRecording();

    await vi.waitFor(() => {
      expect(mockTranscribeMutateAsync).toHaveBeenCalled();
    });

    // Should not proceed to createNote
    expect(mockCreateNoteMutateAsync).not.toHaveBeenCalled();
  });

  it('retry is a no-op for non-existent noteId', () => {
    const { retry } = useVoiceNotePipeline('r1', 'p1');
    // Should not throw
    retry('non-existent');
    expect(mockPresignMutateAsync).not.toHaveBeenCalled();
  });

  it('isRecording reflects audio context state', () => {
    const { isRecording } = useVoiceNotePipeline('r1', 'p1');
    expect(isRecording).toBe(false);
  });

  it('amplitudes reflects audio context state', () => {
    const { amplitudes } = useVoiceNotePipeline('r1', 'p1');
    expect(amplitudes).toEqual([]);
  });

  it('pendingNotes starts empty', () => {
    const { pendingNotes } = useVoiceNotePipeline('r1', 'p1');
    expect(pendingNotes).toEqual([]);
  });
});
