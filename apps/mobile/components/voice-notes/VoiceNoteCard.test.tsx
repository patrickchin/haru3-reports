import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TestRenderer, { act } from "react-test-renderer";
import { type VoiceNotePlayer } from "@/hooks/useVoiceNotePlayer";

const playerMock = vi.fn<() => VoiceNotePlayer>();
const deleteMutateMock = vi.fn();

vi.mock("@/hooks/useVoiceNotePlayer", () => ({
  useVoiceNotePlayer: () => playerMock(),
}));

vi.mock("@/hooks/useProjectFiles", () => ({
  useDeleteFile: () => ({ mutate: deleteMutateMock, isPending: false }),
}));

vi.mock("@/hooks/useCopyToClipboard", () => ({
  useCopyToClipboard: () => ({ copy: vi.fn(), isCopied: () => false, copiedKey: null }),
}));

vi.mock("lucide-react-native", () => ({
  Play: () => React.createElement("PlayIcon"),
  Pause: () => React.createElement("PauseIcon"),
  Trash2: () => React.createElement("TrashIcon"),
}));

vi.mock("@/components/ui/Card", () => ({
  Card: ({ children, testID }: { children: React.ReactNode; testID?: string }) =>
    React.createElement("Card", { testID }, children),
}));

vi.mock("react-native", () => {
  const mk = (name: string) =>
    function Stub(props: { children?: React.ReactNode; [key: string]: unknown }) {
      return React.createElement(name, props, props.children ?? null);
    };
  return {
    View: mk("View"),
    Text: mk("Text"),
    Pressable: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement("Pressable", props, children ?? null),
    ActivityIndicator: (props: Record<string, unknown>) =>
      React.createElement("ActivityIndicator", props),
    Modal: mk("Modal"),
  };
});

vi.mock("@/components/ui/AppDialogSheet", () => ({
  AppDialogSheet: (props: { visible: boolean; title: string; actions: { label: string; onPress: () => void }[] }) =>
    props.visible
      ? React.createElement("AppDialogSheet", { testID: "dialog-sheet", title: props.title },
          props.actions.map((a) =>
            React.createElement("Pressable", { key: a.label, testID: `dialog-action-${a.label}`, onPress: a.onPress },
              React.createElement("Text", null, a.label),
            ),
          ),
        )
      : null,
}));

vi.mock("@/lib/app-dialog-copy", () => ({
  getDeleteVoiceNoteDialogCopy: () => ({
    title: "Delete Voice Note",
    message: "Are you sure?",
    tone: "danger",
    noticeTitle: "Permanent action",
    confirmLabel: "Delete",
    cancelLabel: "Cancel",
    confirmVariant: "destructive",
  }),
}));

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

const file = {
  id: "voice-1",
  project_id: "p-1",
  uploaded_by: "u-1",
  bucket: "project-files",
  storage_path: "p-1/voice/abc.m4a",
  category: "voice-note" as const,
  filename: "voice.m4a",
  mime_type: "audio/m4a",
  size_bytes: 1234,
  duration_ms: 60000,
  deleted_at: null,
  created_at: "2026-04-30T00:00:00Z",
  updated_at: "2026-04-30T00:00:00Z",
};

function makePlayer(overrides: Partial<VoiceNotePlayer> = {}): VoiceNotePlayer {
  return {
    isLoading: false,
    isDownloading: false,
    isPlaying: false,
    positionMs: 0,
    durationMs: 60000,
    error: null,
    play: vi.fn(),
    pause: vi.fn(),
    seekTo: vi.fn(),
    preload: vi.fn(),
    ...overrides,
  };
}

describe("VoiceNoteCard", () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    vi.clearAllMocks();
  });

  afterEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = false;
  });

  it("shows a downloading state instead of a pause icon while audio is being cached", async () => {
    playerMock.mockReturnValue(makePlayer({ isLoading: true, isDownloading: true }));
    const { VoiceNoteCard } = await import("./VoiceNoteCard");

    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<VoiceNoteCard file={file} />);
    });

    const json = JSON.stringify(renderer.toJSON());
    expect(json).toContain("Downloading");
    expect(json).toContain("ActivityIndicator");
    expect(json).not.toContain("PauseIcon");
  });

  it("renders playback progress and seeks when the progress track is pressed", async () => {
    const seekTo = vi.fn();
    playerMock.mockReturnValue(
      makePlayer({ positionMs: 15000, durationMs: 60000, seekTo }),
    );
    const { VoiceNoteCard } = await import("./VoiceNoteCard");

    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<VoiceNoteCard file={file} />);
    });

    const json = JSON.stringify(renderer.toJSON());
    expect(json).toContain("0:15 / 1:00");
    expect(json).not.toContain('"children":["Voice note"]');
    const progressTrack = renderer.root.findByProps({
      testID: "voice-note-progress-voice-1",
    });

    act(() => {
      progressTrack.props.onLayout({ nativeEvent: { layout: { width: 200 } } });
    });
    act(() => {
      progressTrack.props.onPress({ nativeEvent: { locationX: 100 } });
    });

    expect(seekTo).toHaveBeenCalledWith(30000);
  });

  it("renders transcription text when provided and the placeholder otherwise", async () => {
    playerMock.mockReturnValue(makePlayer());
    const { VoiceNoteCard } = await import("./VoiceNoteCard");

    let withTranscript!: TestRenderer.ReactTestRenderer;
    act(() => {
      withTranscript = TestRenderer.create(
        <VoiceNoteCard file={file} transcription="hello world transcript" />,
      );
    });
    const withJson = JSON.stringify(withTranscript.toJSON());
    expect(withJson).toContain("hello world transcript");
    expect(withJson).not.toContain("(no transcription yet)");

    let withoutTranscript!: TestRenderer.ReactTestRenderer;
    act(() => {
      withoutTranscript = TestRenderer.create(<VoiceNoteCard file={file} />);
    });
    const withoutJson = JSON.stringify(withoutTranscript.toJSON());
    expect(withoutJson).toContain("(no transcription yet)");
  });

  it("collapses transcript text and expands it when tapped", async () => {
    playerMock.mockReturnValue(makePlayer());
    const { VoiceNoteCard } = await import("./VoiceNoteCard");
    const transcript = "Crew poured slab in zone A. Forms were stripped near the west entrance. Electrical rough-in continued on level two. Inspectors walked the north stairwell.";

    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <VoiceNoteCard file={file} transcription={transcript} />,
      );
    });

    const collapsedTranscript = renderer.root.findByProps({
      testID: "voice-note-transcript-voice-1",
    });
    expect(collapsedTranscript.props.accessibilityState).toEqual({ expanded: false });
    expect(collapsedTranscript.findByType("Text" as any).props.numberOfLines).toBe(3);

    act(() => {
      collapsedTranscript.props.onPress();
    });

    const expandedTranscript = renderer.root.findByProps({
      testID: "voice-note-transcript-voice-1",
    });
    expect(expandedTranscript.props.accessibilityState).toEqual({ expanded: true });
    expect(expandedTranscript.findByType("Text" as any).props.numberOfLines).toBeUndefined();
  });

  it("renders a transcript loading state while transcription is pending", async () => {
    playerMock.mockReturnValue(makePlayer());
    const { VoiceNoteCard } = await import("./VoiceNoteCard");

    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <VoiceNoteCard file={file} isTranscribing />,
      );
    });

    const json = JSON.stringify(renderer.toJSON());
    expect(json).toContain("Transcribing");
    expect(json).toContain("ActivityIndicator");
    expect(json).not.toContain("(no transcription yet)");
  });
});
