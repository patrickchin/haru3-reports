import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TestRenderer, { act } from "react-test-renderer";
import { type VoiceNotePlayer } from "@/hooks/useVoiceNotePlayer";

const playerMock = vi.fn<() => VoiceNotePlayer>();
const deleteMutateMock = vi.fn();
const copyMock = vi.fn();

vi.mock("@/hooks/useVoiceNotePlayer", () => ({
  useVoiceNotePlayer: () => playerMock(),
}));

vi.mock("@/hooks/useProjectFiles", () => ({
  useDeleteFile: () => ({ mutate: deleteMutateMock, isPending: false }),
}));

vi.mock("@/hooks/useCopyToClipboard", () => ({
  useCopyToClipboard: () => ({ copy: copyMock, isCopied: () => false, copiedKey: null }),
}));

const summarizeMutateMock = vi.fn();
const summarizeMutationState = {
  mutate: summarizeMutateMock,
  isPending: false,
  isError: false,
  error: null as Error | null,
};

const isSummarizingFileMock = vi.fn<(fileId: string) => boolean>(() => false);

vi.mock("@/hooks/useSummarizeVoiceNote", () => ({
  LONG_TRANSCRIPT_CHAR_THRESHOLD: 400,
  useSummarizeVoiceNote: () => summarizeMutationState,
  useIsSummarizingFile: (fileId: string) => isSummarizingFileMock(fileId),
}));

vi.mock("lucide-react-native", () => ({
  Play: () => React.createElement("PlayIcon"),
  Pause: () => React.createElement("PauseIcon"),
  MoreVertical: () => React.createElement("MoreVerticalIcon"),
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
    ScrollView: mk("ScrollView"),
  };
});

vi.mock("@/components/ui/AppDialogSheet", () => ({
  AppDialogSheet: (props: {
    visible: boolean;
    title: string;
    actions: { label: string; onPress: () => void; testID?: string }[];
    children?: React.ReactNode;
  }) =>
    props.visible
      ? React.createElement(
          "AppDialogSheet",
          { testID: "dialog-sheet", title: props.title },
          props.children ?? null,
          ...props.actions.map((a, i) =>
            React.createElement(
              "Pressable",
              {
                key: a.testID ?? `dialog-action-${i}`,
                testID: a.testID ?? `dialog-action-${i}`,
                onPress: a.onPress,
              },
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

const shareVoiceNoteMock = vi.fn(async () => undefined);
vi.mock("@/lib/voice-note-share", () => ({
  shareVoiceNote: (...args: unknown[]) =>
    (shareVoiceNoteMock as unknown as (...a: unknown[]) => unknown)(...args),
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
    isSummarizingFileMock.mockImplementation(() => false);
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

  it("hides the transcript inline and shows the placeholder only when missing", async () => {
    playerMock.mockReturnValue(makePlayer());
    const { VoiceNoteCard } = await import("./VoiceNoteCard");

    let withTranscript!: TestRenderer.ReactTestRenderer;
    act(() => {
      withTranscript = TestRenderer.create(
        <VoiceNoteCard file={file} transcription="hello world transcript" />,
      );
    });
    const json = JSON.stringify(withTranscript.toJSON());
    // Transcript is no longer surfaced inline — it lives in the options modal.
    expect(json).not.toContain("hello world transcript");
    expect(json).not.toContain("Show full transcript");
    expect(json).not.toContain("(no transcription yet)");

    let withoutTranscript!: TestRenderer.ReactTestRenderer;
    act(() => {
      withoutTranscript = TestRenderer.create(<VoiceNoteCard file={file} />);
    });
    const withoutJson = JSON.stringify(withoutTranscript.toJSON());
    expect(withoutJson).toContain("(no transcription yet)");
  });

  it("renders the captured-at timestamp from file.created_at", async () => {
    playerMock.mockReturnValue(makePlayer());
    const { VoiceNoteCard } = await import("./VoiceNoteCard");

    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<VoiceNoteCard file={file} />);
    });

    const capturedAt = renderer.root.findByProps({
      testID: "voice-note-captured-at-voice-1",
    });
    // Locale-dependent format, but the year and either the month-name or
    // numeric day must always appear for the fixture date 2026-04-30.
    const text = String(capturedAt.props.children);
    expect(text).toContain("2026");
    expect(/Apr|30/.test(text)).toBe(true);
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
    // Raw transcript is not rendered inline — it's reachable via the options modal.
    expect(json).not.toContain("A very long original transcript goes here.");
    expect(json).not.toContain("Show full transcript");
    expect(json).not.toContain('"children":["Summary"]');
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

  it("does NOT auto-fire summarize when a sibling card is already summarizing the same file", async () => {
    // Simulates the cross-card dedup path: another VoiceNoteCard instance
    // for the same file_id already has a summarize mutation in flight, so
    // useIsSummarizingFile(file.id) returns true. The auto-effect must skip.
    playerMock.mockReturnValue(makePlayer());
    isSummarizingFileMock.mockImplementation(() => true);
    const { VoiceNoteCard } = await import("./VoiceNoteCard");

    act(() => {
      TestRenderer.create(
        <VoiceNoteCard file={file} transcription={"y".repeat(500)} />,
      );
    });

    expect(summarizeMutateMock).not.toHaveBeenCalled();
  });

  it("Retry button on the error state fires summarize again", async () => {
    playerMock.mockReturnValue(makePlayer());
    summarizeMutationState.isError = true;
    summarizeMutationState.error = new Error("rate limited");
    const { VoiceNoteCard } = await import("./VoiceNoteCard");

    const longTranscript = "r".repeat(500);
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

    const retryPressable = renderer.root.findByProps({
      accessibilityLabel: "Retry summarize",
    });
    expect(summarizeMutateMock).not.toHaveBeenCalled();
    act(() => {
      retryPressable.props.onPress();
    });
    expect(summarizeMutateMock).toHaveBeenCalledTimes(1);
    expect(summarizeMutateMock).toHaveBeenCalledWith({
      fileId: file.id,
      transcript: longTranscript,
      projectId: file.project_id,
    });
  });

  it("disableAutoSummarize=true suppresses the auto-fire effect even with a long transcript", async () => {
    playerMock.mockReturnValue(makePlayer());
    const { VoiceNoteCard } = await import("./VoiceNoteCard");

    act(() => {
      TestRenderer.create(
        <VoiceNoteCard
          file={file}
          transcription={"x".repeat(500)}
          disableAutoSummarize
        />,
      );
    });

    expect(summarizeMutateMock).not.toHaveBeenCalled();
  });

  it("renders a three-dots options button (not the trash icon) and opens the options dialog when pressed", async () => {
    playerMock.mockReturnValue(makePlayer());
    const { VoiceNoteCard } = await import("./VoiceNoteCard");

    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<VoiceNoteCard file={file} authorName="Alice" />);
    });

    const json = JSON.stringify(renderer.toJSON());
    expect(json).toContain("MoreVerticalIcon");
    expect(json).not.toContain("TrashIcon");

    const optionsButton = renderer.root.findByProps({
      testID: `btn-voice-note-options-${file.id}`,
    });
    act(() => {
      optionsButton.props.onPress();
    });

    const sheet = renderer.root.findByProps({ testID: "dialog-sheet" });
    expect(sheet.props.title).toBe("Voice note options");
    const text = JSON.stringify(renderer.toJSON());
    // Meta block: author, full id, plus the action buttons. Copy is
    // achieved by tapping a row, not by dedicated Copy buttons.
    expect(text).toContain("Alice");
    expect(text).toContain(file.id);
    expect(text).toContain("View transcript");
    expect(text).toContain("Download");
    expect(text).toContain("Share");
    expect(text).toContain("Delete");
    expect(text).not.toContain("Copy ID");
    expect(text).not.toContain("Copy filename");
    expect(text).not.toContain("Copy title");
    expect(text).not.toContain("Copy summary");
    expect(text).not.toContain("Copy transcript");
  });

  it("tapping the ID row in the options sheet copies the full id and keeps the sheet open", async () => {
    playerMock.mockReturnValue(makePlayer());
    const { VoiceNoteCard } = await import("./VoiceNoteCard");

    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<VoiceNoteCard file={file} />);
    });

    act(() => {
      renderer.root
        .findByProps({ testID: `btn-voice-note-options-${file.id}` })
        .props.onPress();
    });
    act(() => {
      renderer.root
        .findByProps({ testID: `voice-note-options-id-${file.id}` })
        .props.onPress();
    });

    expect(copyMock).toHaveBeenCalledWith(file.id, { toast: "Note id copied" });
    // Sheet remains open so the user can copy several rows in a row.
    expect(
      renderer.root.findByProps({ testID: "dialog-sheet" }).props.title,
    ).toBe("Voice note options");
  });

  it("View transcript opens a transcript modal with a Copy transcript action", async () => {
    playerMock.mockReturnValue(makePlayer());
    const { VoiceNoteCard } = await import("./VoiceNoteCard");
    const transcript = "the slab was poured at 0900";

    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <VoiceNoteCard file={file} transcription={transcript} disableAutoSummarize />,
      );
    });

    act(() => {
      renderer.root
        .findByProps({ testID: `btn-voice-note-options-${file.id}` })
        .props.onPress();
    });
    act(() => {
      renderer.root
        .findByProps({
          testID: `dialog-action-voice-note-view-transcript-${file.id}`,
        })
        .props.onPress();
    });

    const sheet = renderer.root.findByProps({ testID: "dialog-sheet" });
    expect(sheet.props.title).toBe("Transcript");
    expect(JSON.stringify(renderer.toJSON())).toContain(transcript);

    act(() => {
      renderer.root
        .findByProps({
          testID: `dialog-action-voice-note-transcript-copy-${file.id}`,
        })
        .props.onPress();
    });

    expect(copyMock).toHaveBeenCalledWith(transcript, { toast: "Transcript copied" });
  });

  it("Share action invokes shareVoiceNote with intent=share after preloading", async () => {
    const preload = vi.fn(async () => undefined);
    playerMock.mockReturnValue(makePlayer({ preload }));
    const { VoiceNoteCard } = await import("./VoiceNoteCard");

    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<VoiceNoteCard file={file} />);
    });

    act(() => {
      renderer.root
        .findByProps({ testID: `btn-voice-note-options-${file.id}` })
        .props.onPress();
    });
    await act(async () => {
      await renderer.root
        .findByProps({ testID: `dialog-action-voice-note-share-${file.id}` })
        .props.onPress();
    });

    expect(preload).toHaveBeenCalled();
    expect(shareVoiceNoteMock).toHaveBeenCalledWith({
      storagePath: file.storage_path,
      mimeType: file.mime_type,
      intent: "share",
    });
  });

  it("Delete action in the options sheet opens the confirm dialog", async () => {
    playerMock.mockReturnValue(makePlayer());
    const { VoiceNoteCard } = await import("./VoiceNoteCard");

    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<VoiceNoteCard file={file} />);
    });

    act(() => {
      renderer.root
        .findByProps({ testID: `btn-voice-note-options-${file.id}` })
        .props.onPress();
    });
    act(() => {
      renderer.root
        .findByProps({ testID: `dialog-action-voice-note-delete-${file.id}` })
        .props.onPress();
    });

    const sheet = renderer.root.findByProps({ testID: "dialog-sheet" });
    expect(sheet.props.title).toBe("Delete Voice Note");
  });
});
