import React, { forwardRef, useImperativeHandle } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TestRenderer, { act } from "react-test-renderer";
import {
  AudioPlaybackProvider,
  type AudioPlaybackContextValue,
  useAudioPlayback,
} from "@/lib/audio/AudioPlaybackProvider";
import { useVoiceNotePlayer, type VoiceNotePlayer } from "./useVoiceNotePlayer";

vi.mock("expo-audio", () => ({
  createAudioPlayer: vi.fn().mockReturnValue({
    currentTime: 0,
    duration: 0,
    playing: false,
    play: vi.fn(),
    pause: vi.fn(),
    seekTo: vi.fn(),
    remove: vi.fn(),
  }),
  setAudioModeAsync: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/file-upload", () => ({
  getSignedUrl: vi.fn().mockResolvedValue("https://signed.example/x"),
}));

vi.mock("@/lib/backend", () => ({ backend: {} }));

vi.mock("expo-file-system/legacy", () => ({
  cacheDirectory: "file:///cache/",
  getInfoAsync: vi.fn().mockResolvedValue({ exists: true }),
  makeDirectoryAsync: vi.fn().mockResolvedValue(undefined),
  downloadAsync: vi.fn().mockResolvedValue({ uri: "file:///cache/x", status: 200 }),
}));

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

const ContextProbe = forwardRef<AudioPlaybackContextValue>((_, ref) => {
  const value = useAudioPlayback();
  useImperativeHandle(ref, () => value, [value]);
  return null;
});
ContextProbe.displayName = "ContextProbe";

const HookProbe = forwardRef<VoiceNotePlayer, { storagePath: string }>(
  ({ storagePath }, ref) => {
    const value = useVoiceNotePlayer(storagePath, { fallbackDurationMs: 30_000 });
    useImperativeHandle(ref, () => value, [value]);
    return null;
  },
);
HookProbe.displayName = "HookProbe";

describe("useVoiceNotePlayer (selector over AudioPlaybackProvider)", () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  });
  afterEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = false;
  });

  it("scopes playback state per storagePath: only the active card sees isPlaying", async () => {
    const ctxRef = React.createRef<AudioPlaybackContextValue>();
    const cardARef = React.createRef<VoiceNotePlayer>();
    const cardBRef = React.createRef<VoiceNotePlayer>();

    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <AudioPlaybackProvider>
          <ContextProbe ref={ctxRef} />
          <HookProbe ref={cardARef} storagePath="p/a.m4a" />
          <HookProbe ref={cardBRef} storagePath="p/b.m4a" />
        </AudioPlaybackProvider>,
      );
    });

    expect(cardARef.current?.isPlaying).toBe(false);
    expect(cardBRef.current?.isPlaying).toBe(false);
    expect(cardARef.current?.durationMs).toBe(30_000);

    // Activate card A through the provider.
    await act(async () => {
      await ctxRef.current!.play({ storagePath: "p/a.m4a" });
    });

    expect(cardARef.current?.isPlaying).toBe(true);
    expect(cardBRef.current?.isPlaying).toBe(false);
    expect(ctxRef.current?.activeStoragePath).toBe("p/a.m4a");

    act(() => renderer.unmount());
  });

  it("calling play() on a card forwards file + authorName to the provider", async () => {
    const HookWithMeta = forwardRef<VoiceNotePlayer>((_, ref) => {
      const value = useVoiceNotePlayer("p/x.m4a", {
        // Minimal stub satisfying the field used by the provider.
        file: {
          id: "f-1",
          project_id: "p",
          storage_path: "p/x.m4a",
          // Other fields are not read by play(), so cast to any.
        } as unknown as Parameters<typeof useVoiceNotePlayer>[1] extends infer O
          ? O extends { file?: infer F }
            ? NonNullable<F>
            : never
          : never,
        authorName: "Alice",
      });
      useImperativeHandle(ref, () => value, [value]);
      return null;
    });
    HookWithMeta.displayName = "HookWithMeta";

    const ctxRef = React.createRef<AudioPlaybackContextValue>();
    const cardRef = React.createRef<VoiceNotePlayer>();

    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <AudioPlaybackProvider>
          <ContextProbe ref={ctxRef} />
          <HookWithMeta ref={cardRef} />
        </AudioPlaybackProvider>,
      );
    });

    await act(async () => {
      await cardRef.current!.play();
    });

    expect(ctxRef.current?.activeStoragePath).toBe("p/x.m4a");
    expect(ctxRef.current?.activeAuthorName).toBe("Alice");
    expect(ctxRef.current?.activeFile?.id).toBe("f-1");

    act(() => renderer.unmount());
  });
});
