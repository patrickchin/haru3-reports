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

const summarizeMutateMock = vi.fn();
const summarizeMutationState = {
  mutate: summarizeMutateMock,
  isPending: false,
  isError: false,
  error: null as Error | null,
};

vi.mock("@/hooks/useSummarizeVoiceNote", () => ({
  LONG_TRANSCRIPT_CHAR_THRESHOLD: 400,
  useSummarizeVoiceNote: () => summarizeMutationState,
  useIsSummarizingFile: () => false,
}));

vi.mock("lucide-react-native", () => ({
  Play: () => React.createElement("PlayIcon"),
  Pause: () => React.createElement("PauseIcon"),
  Trash2: () => React.createElement("TrashIcon"),
  Sparkles: () => React.createElement("SparklesIcon"),
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
    summarizeMutationState.isPending = false;
    summarizeMutationState.isError = false;
    summarizeMutationState.error = null;
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

  it("renders title + summary when both are present on file_metadata", async () => {
    playerMock.mockReturnValue(makePlayer());
    const { VoiceNoteCard } = await import("./VoiceNoteCard");

    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <VoiceNoteCard
          file={{
            ...file,
            voice_title: "Concrete Pour Update",
            voice_summary: "Crew finished slab in zone A; trucks arrived on time.",
          }}
          transcription="A very long original transcript goes here."
          disableAutoSummarize
        />,
      );
    });

    const json = JSON.stringify(renderer.toJSON());
    expect(json).toContain("Concrete Pour Update");
    expect(json).toContain("Crew finished slab in zone A");
    // Default collapsed view shows the "show full transcript" toggle, not
    // the raw transcript.
    expect(json).toContain("Show full transcript");
    expect(json).not.toContain("A very long original transcript goes here.");
  });

  it("hides the Summarize button when the transcript is short", async () => {
    playerMock.mockReturnValue(makePlayer());
    const { VoiceNoteCard } = await import("./VoiceNoteCard");

    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <VoiceNoteCard
          file={file}
          transcription="Short note."
          disableAutoSummarize
        />,
      );
    });

    expect(() =>
      renderer.root.findByProps({ testID: `btn-voice-note-summarize-${file.id}` }),
    ).toThrow();
  });

  it("shows the Summarize button when transcript is long and no summary exists", async () => {
    playerMock.mockReturnValue(makePlayer());
    const { VoiceNoteCard } = await import("./VoiceNoteCard");

    const longTranscript = "x".repeat(500);
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <VoiceNoteCard
          file={file}
          transcription={longTranscript}
          disableAutoSummarize
        />,
      );
    });

    const button = renderer.root.findByProps({
      testID: `btn-voice-note-summarize-${file.id}`,
    });
    act(() => {
      button.props.onPress();
    });
    expect(summarizeMutateMock).toHaveBeenCalledWith({
      fileId: file.id,
      transcript: longTranscript,
      projectId: file.project_id,
    });
  });

  it("auto-fires summarize once for a long transcript with no summary", async () => {
    playerMock.mockReturnValue(makePlayer());
    const { VoiceNoteCard } = await import("./VoiceNoteCard");

    const longTranscript = "y".repeat(500);
    act(() => {
      TestRenderer.create(
        <VoiceNoteCard file={file} transcription={longTranscript} />,
      );
    });

    expect(summarizeMutateMock).toHaveBeenCalledTimes(1);
    expect(summarizeMutateMock).toHaveBeenCalledWith({
      fileId: file.id,
      transcript: longTranscript,
      projectId: file.project_id,
    });
  });

  it("does not auto-summarize when a summary already exists", async () => {
    playerMock.mockReturnValue(makePlayer());
    const { VoiceNoteCard } = await import("./VoiceNoteCard");

    act(() => {
      TestRenderer.create(
        <VoiceNoteCard
          file={{
            ...file,
            voice_title: "Existing title",
            voice_summary: "Existing summary.",
          }}
          transcription={"z".repeat(500)}
        />,
      );
    });

    expect(summarizeMutateMock).not.toHaveBeenCalled();
  });

  it("renders a Summarizing… indicator while the mutation is pending", async () => {
    playerMock.mockReturnValue(makePlayer());
    summarizeMutationState.isPending = true;
    const { VoiceNoteCard } = await import("./VoiceNoteCard");

    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <VoiceNoteCard
          file={file}
          transcription={"q".repeat(500)}
          disableAutoSummarize
        />,
      );
    });

    const json = JSON.stringify(renderer.toJSON());
    expect(json).toContain("Summarizing");
    // Button is hidden while pending
    expect(() =>
      renderer.root.findByProps({ testID: `btn-voice-note-summarize-${file.id}` }),
    ).toThrow();
  });

  it("shows an error message + Retry when the summarize mutation fails", async () => {
    playerMock.mockReturnValue(makePlayer());
    summarizeMutationState.isError = true;
    summarizeMutationState.error = new Error("rate limited");
    const { VoiceNoteCard } = await import("./VoiceNoteCard");

    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <VoiceNoteCard
          file={file}
          transcription={"r".repeat(500)}
          disableAutoSummarize
        />,
      );
    });

    const errorNode = renderer.root.findByProps({
      testID: `voice-note-summary-error-${file.id}`,
    });
    expect(JSON.stringify(errorNode.props.children)).toContain("rate limited");
  });
});
