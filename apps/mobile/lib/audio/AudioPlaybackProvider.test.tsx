import React, { forwardRef, useImperativeHandle } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TestRenderer, { act } from "react-test-renderer";
import {
  AudioPlaybackProvider,
  useAudioPlayback,
  type AudioPlaybackContextValue,
} from "./AudioPlaybackProvider";

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

const ContextProbe = forwardRef<AudioPlaybackContextValue>((_, ref) => {
  const value = useAudioPlayback();
  useImperativeHandle(ref, () => value, [value]);
  return null;
});
ContextProbe.displayName = "ContextProbe";

function renderProvider() {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const ref = React.createRef<AudioPlaybackContextValue>();
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <AudioPlaybackProvider>
        <ContextProbe ref={ref} />
      </AudioPlaybackProvider>,
    );
  });
  return {
    get current() {
      if (!ref.current) throw new Error("provider not mounted");
      return ref.current;
    },
    unmount: () => act(() => renderer.unmount()),
  };
}

describe("AudioPlaybackProvider", () => {
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
    const probe = renderProvider();

    await act(async () => {
      await probe.current.play({ storagePath: "p-1/voice/abc.m4a" });
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
    expect(probe.current.isPlaying).toBe(true);
    expect(probe.current.activeStoragePath).toBe("p-1/voice/abc.m4a");

    // Resuming the same file does not re-download or recreate the player.
    await act(async () => {
      probe.current.pause();
      await probe.current.play({ storagePath: "p-1/voice/abc.m4a" });
    });

    expect(downloadAsyncMock).toHaveBeenCalledTimes(1);
    expect(createAudioPlayerMock).toHaveBeenCalledTimes(1);
    expect(player.play).toHaveBeenCalledTimes(2);
    probe.unmount();
  });

  it("uses an existing cached local file without requesting a signed URL", async () => {
    const player = makePlayer();
    createAudioPlayerMock.mockReturnValue(player);
    getInfoAsyncMock.mockResolvedValue({
      exists: true,
      uri: "file:///cache/voice-notes/p-1_voice_abc.m4a",
    });
    const probe = renderProvider();

    await act(async () => {
      await probe.current.play({ storagePath: "p-1/voice/abc.m4a" });
    });

    expect(getSignedUrlMock).not.toHaveBeenCalled();
    expect(downloadAsyncMock).not.toHaveBeenCalled();
    expect(createAudioPlayerMock).toHaveBeenCalledWith({
      uri: "file:///cache/voice-notes/p-1_voice_abc.m4a",
    });
    probe.unmount();
  });

  it("keeps playback state in sync via polling and clamps seek requests", async () => {
    const player = makePlayer();
    createAudioPlayerMock.mockReturnValue(player);
    getInfoAsyncMock.mockResolvedValue({ exists: true });
    const probe = renderProvider();

    await act(async () => {
      await probe.current.play({
        storagePath: "p-1/voice/abc.m4a",
        fallbackDurationMs: 60_000,
      });
    });

    player.currentTime = 12;
    await act(async () => {
      vi.advanceTimersByTime(250);
    });
    expect(probe.current.positionMs).toBe(12_000);
    expect(probe.current.durationMs).toBe(60_000);

    await act(async () => {
      await probe.current.seekTo(90_000);
    });
    expect(player.seekTo).toHaveBeenCalledWith(60);
    expect(probe.current.positionMs).toBe(60_000);

    act(() => {
      player.playing = false;
      vi.advanceTimersByTime(250);
    });
    expect(probe.current.isPlaying).toBe(false);
    probe.unmount();
  });

  it("configures background-friendly audio mode before playing", async () => {
    const player = makePlayer();
    createAudioPlayerMock.mockReturnValue(player);
    getInfoAsyncMock.mockResolvedValue({ exists: true });
    const probe = renderProvider();

    await act(async () => {
      await probe.current.play({ storagePath: "p-1/voice/abc.m4a" });
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
    probe.unmount();
  });

  it("tearing down the previous player when a different file starts playing", async () => {
    const firstPlayer = makePlayer();
    const secondPlayer = makePlayer();
    createAudioPlayerMock
      .mockReturnValueOnce(firstPlayer)
      .mockReturnValueOnce(secondPlayer);
    getInfoAsyncMock.mockResolvedValue({ exists: true });
    const probe = renderProvider();

    await act(async () => {
      await probe.current.play({ storagePath: "p-1/voice/abc.m4a" });
    });
    expect(firstPlayer.play).toHaveBeenCalledTimes(1);
    expect(probe.current.activeStoragePath).toBe("p-1/voice/abc.m4a");

    await act(async () => {
      await probe.current.play({ storagePath: "p-1/voice/xyz.m4a" });
    });

    expect(firstPlayer.remove).toHaveBeenCalledTimes(1);
    expect(secondPlayer.play).toHaveBeenCalledTimes(1);
    expect(probe.current.activeStoragePath).toBe("p-1/voice/xyz.m4a");
    expect(probe.current.isPlaying).toBe(true);
    probe.unmount();
  });

  it("stop() unloads the player and clears the active file", async () => {
    const player = makePlayer();
    createAudioPlayerMock.mockReturnValue(player);
    getInfoAsyncMock.mockResolvedValue({ exists: true });
    const probe = renderProvider();

    await act(async () => {
      await probe.current.play({ storagePath: "p-1/voice/abc.m4a" });
    });
    expect(probe.current.activeStoragePath).toBe("p-1/voice/abc.m4a");

    act(() => {
      probe.current.stop();
    });

    expect(player.remove).toHaveBeenCalledTimes(1);
    expect(probe.current.activeStoragePath).toBeNull();
    expect(probe.current.isPlaying).toBe(false);
    probe.unmount();
  });

  it("unmounting the provider tears down the active player", async () => {
    const player = makePlayer();
    createAudioPlayerMock.mockReturnValue(player);
    getInfoAsyncMock.mockResolvedValue({ exists: true });
    const probe = renderProvider();

    await act(async () => {
      await probe.current.play({ storagePath: "p-1/voice/abc.m4a" });
    });

    probe.unmount();
    expect(player.remove).toHaveBeenCalledTimes(1);
  });

  it("preload() warms the cache without creating a player", async () => {
    getInfoAsyncMock.mockResolvedValue({ exists: false });
    const probe = renderProvider();

    await act(async () => {
      await probe.current.preload("p-1/voice/abc.m4a");
    });

    expect(downloadAsyncMock).toHaveBeenCalledTimes(1);
    expect(createAudioPlayerMock).not.toHaveBeenCalled();
    expect(probe.current.activeStoragePath).toBeNull();
    probe.unmount();
  });

  it("surfaces an error when the download fails", async () => {
    createAudioPlayerMock.mockReturnValue(makePlayer());
    getInfoAsyncMock.mockResolvedValue({ exists: false });
    downloadAsyncMock.mockResolvedValue({
      uri: "file:///cache/voice-notes/p-1_voice_abc.m4a",
      status: 500,
    });
    const probe = renderProvider();

    await act(async () => {
      await probe.current.play({ storagePath: "p-1/voice/abc.m4a" });
    });

    expect(probe.current.error).toMatch(/Could not download audio/);
    expect(probe.current.isPlaying).toBe(false);
    expect(createAudioPlayerMock).not.toHaveBeenCalled();
    probe.unmount();
  });
});
