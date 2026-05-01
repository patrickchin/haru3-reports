import React, { forwardRef, useImperativeHandle } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TestRenderer, { act } from "react-test-renderer";
import { useSpeechToText } from "./useSpeechToText";

declare global {
  // React 19 act() requires this flag on globalThis to opt the test
  // environment into act warnings.
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

const requestRecordingPermissionsAsyncMock = vi.fn();
const setAudioModeAsyncMock = vi.fn();
const prepareToRecordAsyncMock = vi.fn();
const recordMock = vi.fn();
const stopMock = vi.fn();
const writeAsStringAsyncMock = vi.fn();
const getInfoAsyncMock = vi.fn();
const readAsStringAsyncMock = vi.fn();
const transcribeAudioMock = vi.fn();
const recordVoiceNoteMock = vi.fn();
const uploadVoiceNoteMock = vi.fn();
const transcribeVoiceNoteMock = vi.fn();

const recorder = {
  prepareToRecordAsync: prepareToRecordAsyncMock,
  record: recordMock,
  stop: stopMock,
  uri: "file:///recorded.m4a",
};

let recorderState = {
  metering: null as number | null,
  durationMillis: 2400 as number | null,
};

vi.mock("expo-audio", () => ({
  AudioModule: {
    requestRecordingPermissionsAsync: (...args: unknown[]) =>
      requestRecordingPermissionsAsyncMock(...args),
    setAudioModeAsync: (...args: unknown[]) => setAudioModeAsyncMock(...args),
  },
  RecordingPresets: {
    HIGH_QUALITY: {},
  },
  useAudioRecorder: () => recorder,
  useAudioRecorderState: () => recorderState,
}));

vi.mock("expo-file-system/legacy", () => ({
  cacheDirectory: "file:///cache/",
  documentDirectory: "file:///documents/",
  EncodingType: { Base64: "base64" },
  writeAsStringAsync: (...args: unknown[]) => writeAsStringAsyncMock(...args),
  getInfoAsync: (...args: unknown[]) => getInfoAsyncMock(...args),
  readAsStringAsync: (...args: unknown[]) => readAsStringAsyncMock(...args),
}));

vi.mock("../lib/transcribe", () => ({
  transcribeAudio: (...args: unknown[]) => transcribeAudioMock(...args),
}));

vi.mock("@/lib/backend", () => ({
  backend: {},
}));

vi.mock("@/lib/voice-note-flow", () => ({
  recordVoiceNote: (...args: unknown[]) => recordVoiceNoteMock(...args),
  uploadVoiceNote: (...args: unknown[]) => uploadVoiceNoteMock(...args),
  transcribeVoiceNote: (...args: unknown[]) => transcribeVoiceNoteMock(...args),
}));

type HookHandle = ReturnType<typeof useSpeechToText>;

type HookProbeProps = {
  onResult: (transcript: string) => void;
  saveVoiceNote?: {
    projectId: string;
    uploadedBy: string;
  };
  onVoiceNoteUploaded?: (args: { metadata: { id: string } }) => void;
  onVoiceNoteSaved?: (args: { metadata: { id: string }; transcript: string }) => void;
};

const HookProbe = forwardRef<HookHandle, HookProbeProps>((props, ref) => {
  const value = useSpeechToText(props);
  useImperativeHandle(ref, () => value, [value]);
  return null;
});
HookProbe.displayName = "HookProbe";

function renderHook(props: HookProbeProps) {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const ref = React.createRef<HookHandle>();
  let renderer!: TestRenderer.ReactTestRenderer;

  act(() => {
    renderer = TestRenderer.create(<HookProbe ref={ref} {...props} />);
  });

  return {
    get current() {
      if (!ref.current) throw new Error("hook not mounted");
      return ref.current;
    },
    unmount: () => act(() => renderer.unmount()),
  };
}

async function flushAsyncWork(times = 6) {
  for (let iteration = 0; iteration < times; iteration += 1) {
    await Promise.resolve();
  }
}

describe("useSpeechToText", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    requestRecordingPermissionsAsyncMock.mockResolvedValue({ granted: true });
    setAudioModeAsyncMock.mockResolvedValue(undefined);
    prepareToRecordAsyncMock.mockResolvedValue(undefined);
    recordMock.mockReturnValue(undefined);
    stopMock.mockResolvedValue(undefined);
    writeAsStringAsyncMock.mockResolvedValue(undefined);
    getInfoAsyncMock.mockResolvedValue({ exists: true, size: 4 });
    readAsStringAsyncMock.mockResolvedValue("AAAA");
    transcribeAudioMock.mockResolvedValue({ text: "live transcript" });
    recorder.uri = "file:///recorded.m4a";
    recorderState = { metering: null, durationMillis: 2400 };
    uploadVoiceNoteMock.mockResolvedValue({
      metadata: { id: "file-1" },
      storagePath: "proj-1/voice-notes/file-1.m4a",
    });
    transcribeVoiceNoteMock.mockResolvedValue({
      transcription: "server-mocked transcript",
      transcriptionFailed: false,
    });
  });

  afterEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = false;
    vi.unstubAllEnvs();
  });

  it("stubs the simulator recorder but still calls the real transcribe pipeline when EXPO_PUBLIC_E2E_MOCK_VOICE_NOTE is set", async () => {
    vi.stubEnv("EXPO_PUBLIC_E2E_MOCK_VOICE_NOTE", "true");

    const onResult = vi.fn();
    const onVoiceNoteUploaded = vi.fn();
    const onVoiceNoteSaved = vi.fn();
    const metadata = { id: "file-1" };

    uploadVoiceNoteMock.mockResolvedValue({
      metadata,
      storagePath: "proj-1/voice-notes/mock.m4a",
    });
    transcribeVoiceNoteMock.mockResolvedValue({
      transcription: "server-mocked transcript",
      transcriptionFailed: false,
    });

    const hook = renderHook({
      onResult,
      onVoiceNoteUploaded,
      onVoiceNoteSaved,
      saveVoiceNote: {
        projectId: "proj-1",
        uploadedBy: "user-1",
      },
    });

    await act(async () => {
      await hook.current.start();
    });

    // Recorder is stubbed: no mic permission, no expo-audio calls.
    expect(requestRecordingPermissionsAsyncMock).not.toHaveBeenCalled();
    expect(prepareToRecordAsyncMock).not.toHaveBeenCalled();
    expect(recordMock).not.toHaveBeenCalled();
    expect(hook.current.isRecording).toBe(true);

    await act(async () => {
      await hook.current.stop();
      await flushAsyncWork();
    });

    // A stub audio file is written so the upload has a payload.
    expect(writeAsStringAsyncMock).toHaveBeenCalledTimes(1);
    const [mockUri] = writeAsStringAsyncMock.mock.calls[0] ?? [];
    expect(String(mockUri)).toContain("file:///cache/e2e-voice-note-");

    expect(uploadVoiceNoteMock).toHaveBeenCalledTimes(1);
    const [params] = uploadVoiceNoteMock.mock.calls[0] ?? [];
    expect(params).toMatchObject({
      projectId: "proj-1",
      uploadedBy: "user-1",
      sizeBytes: 4,
      durationMs: 2400,
    });
    expect(String(params.audioUri)).toContain("file:///cache/e2e-voice-note-");

    // The real transcribe pipeline runs — mocking happens server-side.
    expect(transcribeVoiceNoteMock).toHaveBeenCalledTimes(1);
    const [transcribeParams] = transcribeVoiceNoteMock.mock.calls[0] ?? [];
    transcribeAudioMock.mockResolvedValueOnce({ text: "server-mocked transcript" });
    await expect(transcribeParams.transcribe(transcribeParams.audioUri)).resolves.toEqual({
      text: "server-mocked transcript",
    });
    expect(transcribeAudioMock).toHaveBeenCalledWith(transcribeParams.audioUri);

    expect(onVoiceNoteUploaded).toHaveBeenCalledWith({ metadata });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(onResult).toHaveBeenCalledWith("server-mocked transcript");
    expect(onVoiceNoteSaved).toHaveBeenCalledWith({
      metadata,
      transcript: "server-mocked transcript",
    });
    expect(hook.current.isRecording).toBe(false);
    expect(hook.current.error).toBeNull();

    hook.unmount();
  });

  it("publishes saved voice metadata before transcription finishes and allows a new recording", async () => {
    let resolveTranscription!: (value: {
      transcription: string;
      transcriptionFailed: boolean;
    }) => void;

    transcribeVoiceNoteMock.mockImplementation(
      () => new Promise((resolve) => {
        resolveTranscription = resolve;
      }),
    );

    const onResult = vi.fn();
    const onVoiceNoteUploaded = vi.fn();
    const onVoiceNoteSaved = vi.fn();
    const hook = renderHook({
      onResult,
      onVoiceNoteUploaded,
      onVoiceNoteSaved,
      saveVoiceNote: {
        projectId: "proj-1",
        uploadedBy: "user-1",
      },
    });

    await act(async () => {
      await hook.current.start();
    });

    await act(async () => {
      await hook.current.stop();
      await flushAsyncWork();
    });

    expect(onVoiceNoteUploaded).toHaveBeenCalledWith({ metadata: { id: "file-1" } });
    expect(onVoiceNoteSaved).not.toHaveBeenCalled();
    expect(hook.current.isRecording).toBe(false);
    expect(hook.current.isTranscribing).toBe(false);
    expect(hook.current.interimTranscript).toBe("");

    await act(async () => {
      await hook.current.start();
    });
    expect(hook.current.isRecording).toBe(true);

    await act(async () => {
      resolveTranscription({
        transcription: "finished transcript",
        transcriptionFailed: false,
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onResult).toHaveBeenCalledWith("finished transcript");
    expect(onVoiceNoteSaved).toHaveBeenCalledWith({
      metadata: { id: "file-1" },
      transcript: "finished transcript",
    });

    hook.unmount();
  });

  it("still persists report_notes after unmount but suppresses UI callbacks", async () => {
    let resolveTranscription!: (value: {
      transcription: string;
      transcriptionFailed: boolean;
    }) => void;

    transcribeVoiceNoteMock.mockImplementation(
      () => new Promise((resolve) => {
        resolveTranscription = resolve;
      }),
    );

    const onResult = vi.fn();
    const onVoiceNoteUploaded = vi.fn();
    const onVoiceNoteSaved = vi.fn();
    const hook = renderHook({
      onResult,
      onVoiceNoteUploaded,
      onVoiceNoteSaved,
      saveVoiceNote: {
        projectId: "proj-1",
        uploadedBy: "user-1",
      },
    });

    await act(async () => {
      await hook.current.start();
    });
    await act(async () => {
      await hook.current.stop();
      await flushAsyncWork();
    });

    expect(onVoiceNoteUploaded).toHaveBeenCalledWith({ metadata: { id: "file-1" } });

    hook.unmount();

    await act(async () => {
      resolveTranscription({
        transcription: "late transcript",
        transcriptionFailed: false,
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    // UI callback suppressed after unmount.
    expect(onResult).not.toHaveBeenCalled();
    // Data-layer callback fires even after unmount so the report_notes
    // row is always created — preventing orphaned file_metadata rows.
    expect(onVoiceNoteSaved).toHaveBeenCalledWith({
      metadata: { id: "file-1" },
      transcript: "late transcript",
    });
  });

  it("completes upload+transcribe after unmount to prevent orphaned files", async () => {
    let resolveUpload!: (value: {
      metadata: { id: string };
      storagePath: string;
    }) => void;

    uploadVoiceNoteMock.mockImplementation(
      () => new Promise((resolve) => {
        resolveUpload = resolve;
      }),
    );

    const onResult = vi.fn();
    const onVoiceNoteUploaded = vi.fn();
    const onVoiceNoteSaved = vi.fn();
    const hook = renderHook({
      onResult,
      onVoiceNoteUploaded,
      onVoiceNoteSaved,
      saveVoiceNote: {
        projectId: "proj-1",
        uploadedBy: "user-1",
      },
    });

    await act(async () => {
      await hook.current.start();
    });
    await act(async () => {
      await hook.current.stop();
      await flushAsyncWork();
    });

    expect(uploadVoiceNoteMock).toHaveBeenCalledTimes(1);
    hook.unmount();

    await act(async () => {
      resolveUpload({
        metadata: { id: "late-file" },
        storagePath: "proj-1/voice-notes/late-file.m4a",
      });
      await flushAsyncWork();
    });

    // Data-layer callbacks fire even after unmount to persist the note.
    expect(onVoiceNoteUploaded).toHaveBeenCalledWith({ metadata: { id: "late-file" } });
    expect(transcribeVoiceNoteMock).toHaveBeenCalledTimes(1);
    expect(onVoiceNoteSaved).toHaveBeenCalledWith({
      metadata: { id: "late-file" },
      transcript: "server-mocked transcript",
    });
    // UI callback suppressed after unmount.
    expect(onResult).not.toHaveBeenCalled();
  });

  it("keeps the existing real recording path when the E2E mock flag is disabled", async () => {
    const onResult = vi.fn();
    const hook = renderHook({ onResult });

    await act(async () => {
      await hook.current.start();
    });

    expect(requestRecordingPermissionsAsyncMock).toHaveBeenCalledTimes(1);
    expect(prepareToRecordAsyncMock).toHaveBeenCalledTimes(1);
    expect(recordMock).toHaveBeenCalledTimes(1);
    expect(hook.current.isRecording).toBe(true);

    await act(async () => {
      await hook.current.stop();
    });

    expect(stopMock).toHaveBeenCalledTimes(1);
    expect(transcribeAudioMock).toHaveBeenCalledWith("file:///recorded.m4a");
    expect(recordVoiceNoteMock).not.toHaveBeenCalled();
    expect(onResult).toHaveBeenCalledWith("live transcript");

    hook.unmount();
  });

  it("flips isTranscribing on as soon as recording stops and clears it after transcription resolves", async () => {
    let resolveTranscribe!: (value: { text: string }) => void;
    transcribeAudioMock.mockImplementation(
      () => new Promise<{ text: string }>((resolve) => {
        resolveTranscribe = resolve;
      }),
    );

    const onResult = vi.fn();
    const hook = renderHook({ onResult });

    await act(async () => {
      await hook.current.start();
    });
    expect(hook.current.isTranscribing).toBe(false);

    // Kick off stop() but don't await its full completion — the transcribe
    // promise is parked above so we can observe the in-flight state.
    let stopPromise!: Promise<void>;
    await act(async () => {
      stopPromise = hook.current.stop();
      // Flush microtasks so React applies the synchronous setState calls
      // queued at the top of stop() (setIsRecording(false) +
      // setIsTranscribing(true)) and the post-recorder.stop() awaits.
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(hook.current.isRecording).toBe(false);
    expect(hook.current.isTranscribing).toBe(true);
    expect(hook.current.interimTranscript).toBe("Transcribing\u2026");

    await act(async () => {
      resolveTranscribe({ text: "live transcript" });
      await stopPromise;
    });

    expect(hook.current.isTranscribing).toBe(false);
    expect(hook.current.interimTranscript).toBe("");
    expect(onResult).toHaveBeenCalledWith("live transcript");

    hook.unmount();
  });
});