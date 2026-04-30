import React, { forwardRef, useImperativeHandle } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TestRenderer, { act } from "react-test-renderer";
import { useVoiceNotePlayer, type VoiceNotePlayer } from "./useVoiceNotePlayer";

const createAudioPlayerMock = vi.fn();
const setAudioModeAsyncMock = vi.fn();
const getSignedUrlMock = vi.fn();
const getInfoAsyncMock = vi.fn();
const makeDirectoryAsyncMock = vi.fn();
const downloadAsyncMock = vi.fn();

vi.mock("expo-audio", () => ({
  createAudioPlayer: (...args: unknown[]) => createAudioPlayerMock(...args),
  setAudioModeAsync: (...args: unknown[]) => setAudioModeAsyncMock(...args),
}));

vi.mock("@/lib/file-upload", () => ({
  getSignedUrl: (...args: unknown[]) => getSignedUrlMock(...args),
}));

vi.mock("@/lib/backend", () => ({
  backend: {},
}));

vi.mock("expo-file-system/legacy", () => ({
  cacheDirectory: "file:///cache/",
  getInfoAsync: (...args: unknown[]) => getInfoAsyncMock(...args),
  makeDirectoryAsync: (...args: unknown[]) => makeDirectoryAsyncMock(...args),
  downloadAsync: (...args: unknown[]) => downloadAsyncMock(...args),
}));

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

type MockPlayer = {
  currentTime: number;
  duration: number;
  playing: boolean;
  play: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
  seekTo: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
};

const HookProbe = forwardRef<VoiceNotePlayer, { storagePath: string; durationMs?: number }>(
  ({ storagePath, durationMs = 60000 }, ref) => {
    const value = useVoiceNotePlayer(storagePath, durationMs);
    useImperativeHandle(ref, () => value, [value]);
    return null;
  },
);
HookProbe.displayName = "HookProbe";

function makePlayer(): MockPlayer {
  return {
    currentTime: 0,
    duration: 60,
    playing: false,
    play: vi.fn(function play(this: MockPlayer) {
      this.playing = true;
    }),
    pause: vi.fn(function pause(this: MockPlayer) {
      this.playing = false;
    }),
    seekTo: vi.fn(async function seekTo(this: MockPlayer, seconds: number) {
      this.currentTime = seconds;
    }),
    remove: vi.fn(),
  };
}

function renderHook(storagePath = "p-1/voice/abc.m4a") {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const ref = React.createRef<VoiceNotePlayer>();
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<HookProbe ref={ref} storagePath={storagePath} />);
  });
  return {
    get current() {
      if (!ref.current) throw new Error("hook not mounted");
      return ref.current;
    },
    unmount: () => act(() => renderer.unmount()),
  };
}

function renderTwoHooks(
  firstStoragePath = "p-1/voice/abc.m4a",
  secondStoragePath = "p-1/voice/xyz.m4a",
) {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const firstRef = React.createRef<VoiceNotePlayer>();
  const secondRef = React.createRef<VoiceNotePlayer>();
  let renderer!: TestRenderer.ReactTestRenderer;

  act(() => {
    renderer = TestRenderer.create(
      <>
        <HookProbe ref={firstRef} storagePath={firstStoragePath} />
        <HookProbe ref={secondRef} storagePath={secondStoragePath} />
      </>,
    );
  });

  return {
    get first() {
      if (!firstRef.current) throw new Error("first hook not mounted");
      return firstRef.current;
    },
    get second() {
      if (!secondRef.current) throw new Error("second hook not mounted");
      return secondRef.current;
    },
    unmount: () => act(() => renderer.unmount()),
  };
}

describe("useVoiceNotePlayer", () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    vi.useFakeTimers();
    vi.clearAllMocks();
    setAudioModeAsyncMock.mockResolvedValue(undefined);
    getSignedUrlMock.mockResolvedValue("https://signed.example/abc.m4a");
    makeDirectoryAsyncMock.mockResolvedValue(undefined);
    downloadAsyncMock.mockResolvedValue({
      uri: "file:///cache/voice-notes/p-1_voice_abc.m4a",
      status: 200,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.IS_REACT_ACT_ENVIRONMENT = false;
  });

  it("downloads a remote voice note once, caches it locally, and plays from the cached file", async () => {
    const player = makePlayer();
    createAudioPlayerMock.mockReturnValue(player);
    getInfoAsyncMock.mockResolvedValue({ exists: false });
    const hook = renderHook();

    await act(async () => {
      await hook.current.play();
    });

    expect(makeDirectoryAsyncMock).toHaveBeenCalledWith(
      "file:///cache/voice-notes/",
      { intermediates: true },
    );
    expect(downloadAsyncMock).toHaveBeenCalledWith(
      "https://signed.example/abc.m4a",
      "file:///cache/voice-notes/p-1_voice_abc.m4a",
    );
    expect(createAudioPlayerMock).toHaveBeenCalledWith({
      uri: "file:///cache/voice-notes/p-1_voice_abc.m4a",
    });
    expect(player.play).toHaveBeenCalledTimes(1);
    expect(hook.current.isPlaying).toBe(true);
    expect(hook.current.isDownloading).toBe(false);

    await act(async () => {
      hook.current.pause();
      await hook.current.play();
    });

    expect(downloadAsyncMock).toHaveBeenCalledTimes(1);
    expect(player.play).toHaveBeenCalledTimes(2);
    hook.unmount();
  });

  it("uses an existing cached local file without requesting a signed URL", async () => {
    const player = makePlayer();
    createAudioPlayerMock.mockReturnValue(player);
    getInfoAsyncMock.mockResolvedValue({
      exists: true,
      uri: "file:///cache/voice-notes/p-1_voice_abc.m4a",
    });
    const hook = renderHook();

    await act(async () => {
      await hook.current.play();
    });

    expect(getSignedUrlMock).not.toHaveBeenCalled();
    expect(downloadAsyncMock).not.toHaveBeenCalled();
    expect(createAudioPlayerMock).toHaveBeenCalledWith({
      uri: "file:///cache/voice-notes/p-1_voice_abc.m4a",
    });
    hook.unmount();
  });

  it("coalesces concurrent play calls into one download and one player", async () => {
    const player = makePlayer();
    createAudioPlayerMock.mockReturnValue(player);
    getInfoAsyncMock.mockResolvedValue({ exists: false });
    const hook = renderHook();

    await act(async () => {
      await Promise.all([hook.current.play(), hook.current.play()]);
    });

    expect(downloadAsyncMock).toHaveBeenCalledTimes(1);
    expect(createAudioPlayerMock).toHaveBeenCalledTimes(1);
    expect(player.play).toHaveBeenCalledTimes(2);
    hook.unmount();
  });

  it("keeps playback state in sync with the player and clamps seek requests", async () => {
    const player = makePlayer();
    createAudioPlayerMock.mockReturnValue(player);
    getInfoAsyncMock.mockResolvedValue({ exists: true });
    const hook = renderHook();

    await act(async () => {
      await hook.current.play();
    });

    player.currentTime = 12;
    await act(async () => {
      vi.advanceTimersByTime(250);
    });

    expect(hook.current.positionMs).toBe(12000);
    expect(hook.current.durationMs).toBe(60000);

    await act(async () => {
      await hook.current.seekTo(90000);
    });
    expect(player.seekTo).toHaveBeenCalledWith(60);
    expect(hook.current.positionMs).toBe(60000);

    act(() => {
      player.playing = false;
      vi.advanceTimersByTime(250);
    });
    expect(hook.current.isPlaying).toBe(false);
    hook.unmount();
  });

  it("configures playback mode for background audio and exclusive audio focus before playing", async () => {
    const player = makePlayer();
    createAudioPlayerMock.mockReturnValue(player);
    getInfoAsyncMock.mockResolvedValue({ exists: true });
    const hook = renderHook();

    await act(async () => {
      await hook.current.play();
    });

    expect(setAudioModeAsyncMock).toHaveBeenCalledWith({
      allowsRecording: false,
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: "doNotMix",
    });
    expect(setAudioModeAsyncMock.mock.invocationCallOrder[0]).toBeLessThan(
      player.play.mock.invocationCallOrder[0],
    );
    hook.unmount();
  });

  it("pauses a different voice-note player before starting playback", async () => {
    const firstPlayer = makePlayer();
    const secondPlayer = makePlayer();
    createAudioPlayerMock.mockReturnValueOnce(firstPlayer).mockReturnValueOnce(secondPlayer);
    getInfoAsyncMock.mockResolvedValue({ exists: true });
    const hooks = renderTwoHooks();

    await act(async () => {
      await hooks.first.play();
    });
    expect(firstPlayer.play).toHaveBeenCalledTimes(1);
    expect(hooks.first.isPlaying).toBe(true);

    await act(async () => {
      await hooks.second.play();
    });

    expect(firstPlayer.pause).toHaveBeenCalledTimes(1);
    expect(hooks.first.isPlaying).toBe(false);
    expect(secondPlayer.play).toHaveBeenCalledTimes(1);
    expect(hooks.second.isPlaying).toBe(true);
    hooks.unmount();
  });
});
