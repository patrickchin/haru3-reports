/**
 * Tests for VoiceRecorder wrapper.
 * TODO(audio-port): Re-enable after migrating to expo-audio
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { VoiceRecorder } from "../recorder";
// import { Audio } from "expo-av";

const Audio = {
  requestPermissionsAsync: vi.fn(),
  setAudioModeAsync: vi.fn(),
  Recording: vi.fn(),
};

vi.mock("expo-av");

// TODO(audio-port): unskip when expo-audio is wired up
describe.skip("VoiceRecorder", () => {
  let recorder: VoiceRecorder;
  let mockRecording: any;

  beforeEach(() => {
    recorder = new VoiceRecorder();

    mockRecording = {
      prepareToRecordAsync: vi.fn().mockResolvedValue(undefined),
      startAsync: vi.fn().mockResolvedValue(undefined),
      stopAndUnloadAsync: vi.fn().mockResolvedValue(undefined),
      getURI: vi.fn().mockReturnValue("file://recorded.m4a"),
      getStatusAsync: vi.fn().mockResolvedValue({
        isRecording: true,
        durationMillis: 5000,
        metering: -30,
      }),
    };

    vi.mocked(Audio.requestPermissionsAsync).mockResolvedValue({
      status: "granted",
      granted: true,
    } as any);
    vi.mocked(Audio.setAudioModeAsync).mockResolvedValue(undefined);
    vi.mocked(Audio.Recording).mockImplementation(() => mockRecording as any);
  });

  it("starts recording after permission granted", async () => {
    const onStatusChange = vi.fn();
    await recorder.start(onStatusChange);

    expect(Audio.requestPermissionsAsync).toHaveBeenCalled();
    expect(mockRecording.prepareToRecordAsync).toHaveBeenCalled();
    expect(mockRecording.startAsync).toHaveBeenCalled();
  });

  it("throws if permission denied", async () => {
    vi.mocked(Audio.requestPermissionsAsync).mockResolvedValue({
      status: "denied",
      granted: false,
    } as any);

    await expect(recorder.start(vi.fn())).rejects.toThrow("Microphone permission not granted");
  });

  it("stops recording and returns uri + duration", async () => {
    const onStatusChange = vi.fn();
    await recorder.start(onStatusChange);

    const result = await recorder.stop();

    expect(mockRecording.stopAndUnloadAsync).toHaveBeenCalled();
    expect(result.uri).toBe("file://recorded.m4a");
    expect(result.durationMs).toBe(5000);
  });

  it("cancels recording without throwing", async () => {
    const onStatusChange = vi.fn();
    await recorder.start(onStatusChange);

    await expect(recorder.cancel()).resolves.toBeUndefined();
    expect(mockRecording.stopAndUnloadAsync).toHaveBeenCalled();
  });

  it("polls status and calls onStatusChange", async () => {
    const onStatusChange = vi.fn();
    await recorder.start(onStatusChange);

    // Wait for at least one status poll
    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(onStatusChange).toHaveBeenCalledWith(
      expect.objectContaining({
        isRecording: true,
        durationMs: 5000,
        meteringLevel: -30,
      })
    );
  });
});
