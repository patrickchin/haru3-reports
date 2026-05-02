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

let pathnameValue = "/projects/p-1/reports/r-1";
const appStateListeners: Array<(s: string) => void> = [];

vi.mock("expo-audio", () => ({
  createAudioPlayer: (...args: unknown[]) => createAudioPlayerMock(...args),
  setAudioModeAsync: (...args: unknown[]) => setAudioModeAsyncMock(...args),
}));

vi.mock("expo-router", () => ({
  usePathname: () => pathnameValue,
}));

vi.mock("react-native", () => ({
  AppState: {
    addEventListener: (
      _event: string,
      handler: (s: string) => void,
    ): { remove: () => void } => {
      appStateListeners.push(handler);
      return {
        remove: () => {
          const i = appStateListeners.indexOf(handler);
          if (i >= 0) appStateListeners.splice(i, 1);
        },
      };
    },
  },
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

type StatusListener = (status: {
  currentTime: number;
  duration: number;
  playing: boolean;
  didJustFinish: boolean;
  isLoaded: boolean;
}) => void;

type MockPlayer = {
  currentTime: number;
  duration: number;
  playing: boolean;
  volume: number;
  play: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
  seekTo: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
  addListener: ReturnType<typeof vi.fn>;
  /** Test-only: emit a playbackStatusUpdate to all subscribed listeners. */
  emit: (overrides?: Partial<Parameters<StatusListener>[0]>) => void;
  listeners: StatusListener[];
};

function makePlayer(): MockPlayer {
  const listeners: StatusListener[] = [];
  const player: MockPlayer = {
    currentTime: 0,
    duration: 60,
    playing: false,
    volume: 1,
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
    addListener: vi.fn((event: string, cb: StatusListener) => {
      if (event === "playbackStatusUpdate") listeners.push(cb);
      return {
        remove: () => {
          const i = listeners.indexOf(cb);
          if (i >= 0) listeners.splice(i, 1);
        },
      };
    }),
    listeners,
    emit(overrides) {
      const status = {
        currentTime: player.currentTime,
        duration: player.duration,
        playing: player.playing,
        didJustFinish: false,
        isLoaded: true,
        ...overrides,
      };
      for (const cb of [...listeners]) cb(status);
    },
  };
  return player;
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
    vi.clearAllMocks();
    pathnameValue = "/projects/p-1/reports/r-1";
    appStateListeners.length = 0;
    setAudioModeAsyncMock.mockResolvedValue(undefined);
    getSignedUrlMock.mockResolvedValue("https://signed.example/abc.m4a");
    makeDirectoryAsyncMock.mockResolvedValue(undefined);
    downloadAsyncMock.mockResolvedValue({
      uri: "file:///cache/voice-notes/p-1_voice_abc.m4a",
      status: 200,
    });
  });

  afterEach(() => {
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

  it("listener-driven sync: position/duration update via playbackStatusUpdate, seek clamps", async () => {
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
    act(() => {
      player.emit();
    });
    expect(probe.current.positionMs).toBe(12_000);
    expect(probe.current.durationMs).toBe(60_000);

    await act(async () => {
      await probe.current.seekTo(90_000);
    });
    expect(player.seekTo).toHaveBeenCalledWith(60);
    expect(probe.current.positionMs).toBe(60_000);
    probe.unmount();
  });

  it("REGRESSION: optimistic isPlaying survives a delayed first playbackStatusUpdate", async () => {
    // The old polling implementation could observe `playing=false`
    // immediately after `p.play()` (before expo-audio set the flag) and
    // write that into state, leaving the play/pause button stuck on
    // Play. The new listener-driven flow stays optimistic until the
    // listener fires with `playing: true`.
    const player = makePlayer();
    createAudioPlayerMock.mockReturnValue(player);
    getInfoAsyncMock.mockResolvedValue({ exists: true });
    const probe = renderProvider();

    await act(async () => {
      await probe.current.play({ storagePath: "p-1/voice/abc.m4a" });
    });

    // Right after play() returns, no listener tick has fired yet but the
    // UI is already optimistically Playing.
    expect(probe.current.isPlaying).toBe(true);

    // First listener tick: the player has actually started.
    act(() => {
      player.emit({ playing: true, currentTime: 0.05 });
    });
    expect(probe.current.isPlaying).toBe(true);

    // Second listener tick mid-playback.
    act(() => {
      player.emit({ playing: true, currentTime: 1.5 });
    });
    expect(probe.current.isPlaying).toBe(true);
    expect(probe.current.positionMs).toBe(1_500);
    probe.unmount();
  });

  it("auto-stops on natural finish via didJustFinish", async () => {
    const player = makePlayer();
    createAudioPlayerMock.mockReturnValue(player);
    getInfoAsyncMock.mockResolvedValue({ exists: true });
    const probe = renderProvider();

    await act(async () => {
      await probe.current.play({ storagePath: "p-1/voice/abc.m4a" });
    });

    setAudioModeAsyncMock.mockClear();
    act(() => {
      player.emit({ didJustFinish: true, playing: false });
    });

    expect(probe.current.isPlaying).toBe(false);
    expect(probe.current.activeStoragePath).toBeNull();
    expect(player.remove).toHaveBeenCalledTimes(1);
    // Released audio session so the user's music can auto-resume.
    expect(setAudioModeAsyncMock).toHaveBeenCalledWith(
      expect.objectContaining({ interruptionMode: "mixWithOthers" }),
    );
    probe.unmount();
  });

  it("auto-stops when the pathname changes (user navigates away)", async () => {
    const player = makePlayer();
    createAudioPlayerMock.mockReturnValue(player);
    getInfoAsyncMock.mockResolvedValue({ exists: true });
    const probe = renderProvider();

    await act(async () => {
      await probe.current.play({ storagePath: "p-1/voice/abc.m4a" });
    });
    expect(probe.current.activeStoragePath).toBe("p-1/voice/abc.m4a");

    // Simulate a navigation: change pathnameValue and re-render the
    // provider tree so usePathname() returns the new value.
    pathnameValue = "/projects/p-1/reports/r-2";
    await act(async () => {
      // Force a re-render by toggling a state via no-op play of the same
      // file would be a no-op; instead we rely on the provider's own
      // useEffect to pick up the new pathname on next render. Trigger a
      // render by reading + writing some state.
      await probe.current.preload("p-1/voice/abc.m4a");
    });
    // The preload causes a setState → re-render → effect runs → stop.
    expect(player.remove).toHaveBeenCalledTimes(1);
    expect(probe.current.activeStoragePath).toBeNull();
    probe.unmount();
  });

  it("auto-stops when the app goes to background", async () => {
    const player = makePlayer();
    createAudioPlayerMock.mockReturnValue(player);
    getInfoAsyncMock.mockResolvedValue({ exists: true });
    const probe = renderProvider();

    await act(async () => {
      await probe.current.play({ storagePath: "p-1/voice/abc.m4a" });
    });

    expect(appStateListeners.length).toBe(1);
    act(() => {
      appStateListeners[0]("background");
    });
    expect(player.remove).toHaveBeenCalledTimes(1);
    expect(probe.current.activeStoragePath).toBeNull();
    probe.unmount();
  });

  it("uses the doNotMix audio mode when starting a voice note", async () => {
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
      shouldPlayInBackground: false,
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

  it("stop() unloads the player, clears the active file, and releases the audio session", async () => {
    const player = makePlayer();
    createAudioPlayerMock.mockReturnValue(player);
    getInfoAsyncMock.mockResolvedValue({ exists: true });
    const probe = renderProvider();

    await act(async () => {
      await probe.current.play({ storagePath: "p-1/voice/abc.m4a" });
    });
    expect(probe.current.activeStoragePath).toBe("p-1/voice/abc.m4a");

    setAudioModeAsyncMock.mockClear();
    act(() => {
      probe.current.stop();
    });

    expect(player.remove).toHaveBeenCalledTimes(1);
    expect(probe.current.activeStoragePath).toBeNull();
    expect(probe.current.isPlaying).toBe(false);
    expect(setAudioModeAsyncMock).toHaveBeenCalledWith(
      expect.objectContaining({ interruptionMode: "mixWithOthers" }),
    );
    probe.unmount();
  });

  it("REGRESSION: destroyPlayer pauses + mutes before remove (orphan playback fix)", async () => {
    // expo-audio's `remove()` doesn't always halt audio that is already
    // buffered/playing. If we don't pause first, navigating away (back
    // button → pathname change → stop → destroyPlayer) leaves an orphan
    // player audibly running. The next play() then creates a SECOND
    // player on top of it, so the user can't stop the first one from
    // the UI. destroyPlayer must call pause() (and mute) before remove().
    const player = makePlayer();
    createAudioPlayerMock.mockReturnValue(player);
    getInfoAsyncMock.mockResolvedValue({ exists: true });
    const probe = renderProvider();

    await act(async () => {
      await probe.current.play({ storagePath: "p-1/voice/abc.m4a" });
    });
    expect(player.play).toHaveBeenCalledTimes(1);
    const playOrder = player.play.mock.invocationCallOrder[0];

    act(() => {
      probe.current.stop();
    });

    expect(player.pause).toHaveBeenCalledTimes(1);
    expect(player.remove).toHaveBeenCalledTimes(1);
    const pauseOrder = player.pause.mock.invocationCallOrder[0];
    const removeOrder = player.remove.mock.invocationCallOrder[0];
    expect(pauseOrder).toBeGreaterThan(playOrder);
    expect(pauseOrder).toBeLessThan(removeOrder);
    expect(player.volume).toBe(0);
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
