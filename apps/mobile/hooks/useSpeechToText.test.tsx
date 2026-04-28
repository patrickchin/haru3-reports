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
}));

type HookHandle = ReturnType<typeof useSpeechToText>;

type HookProbeProps = {
  onResult: (transcript: string) => void;
  saveVoiceNote?: {
    projectId: string;
    uploadedBy: string;
    reportId?: string | null;
  };
  onVoiceNoteSaved?: (file: { id: string }) => void;
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
  });

  afterEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = false;
    vi.unstubAllEnvs();
  });

  it("uses the E2E mock path to persist a voice note without requesting microphone access", async () => {
    vi.stubEnv("EXPO_PUBLIC_E2E_MOCK_VOICE_NOTE", "true");

    const onResult = vi.fn();
    const onVoiceNoteSaved = vi.fn();
    const metadata = { id: "file-1" };

    recordVoiceNoteMock.mockResolvedValue({
      metadata,
      storagePath: "proj-1/voice-notes/mock.m4a",
      transcription: "Mocked voice note for E2E",
      transcriptionFailed: false,
    });

    const hook = renderHook({
      onResult,
      onVoiceNoteSaved,
      saveVoiceNote: {
        projectId: "proj-1",
        uploadedBy: "user-1",
        reportId: "report-1",
      },
    });

    await act(async () => {
      await hook.current.start();
    });

    expect(requestRecordingPermissionsAsyncMock).not.toHaveBeenCalled();
    expect(hook.current.isRecording).toBe(true);

    await act(async () => {
      await hook.current.stop();
    });

    expect(writeAsStringAsyncMock).toHaveBeenCalledTimes(1);
    const [mockUri] = writeAsStringAsyncMock.mock.calls[0] ?? [];
    expect(String(mockUri)).toContain("file:///cache/e2e-voice-note-");

    expect(recordVoiceNoteMock).toHaveBeenCalledTimes(1);
    const [params] = recordVoiceNoteMock.mock.calls[0] ?? [];
    expect(params).toMatchObject({
      projectId: "proj-1",
      uploadedBy: "user-1",
      reportId: "report-1",
      mimeType: "audio/m4a",
      sizeBytes: 4,
      durationMs: 2400,
    });
    expect(String(params.audioUri)).toContain("file:///cache/e2e-voice-note-");
    await expect(params.transcribe(params.audioUri)).resolves.toEqual({
      text: "Mocked voice note for E2E",
    });

    expect(onResult).toHaveBeenCalledWith("Mocked voice note for E2E");
    expect(onVoiceNoteSaved).toHaveBeenCalledWith(metadata);
    expect(hook.current.isRecording).toBe(false);
    expect(hook.current.error).toBeNull();

    hook.unmount();
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
});