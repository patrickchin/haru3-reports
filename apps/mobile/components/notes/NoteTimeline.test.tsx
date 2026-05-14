import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TestRenderer, { act } from "react-test-renderer";
import type { TimelineItem } from "@/hooks/useNoteTimeline";
import type { FileMetadataRow } from "@/lib/file-upload";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
vi.mock("@/components/voice-notes/VoiceNoteCard", () => ({
  VoiceNoteCard: (props: {
    file: FileMetadataRow;
    transcription?: string | null;
    isTranscribing?: boolean;
  }) =>
    React.createElement(
      "VoiceNoteCardStub",
      {
        testID: `voice-${props.file.id}`,
        "data-transcription": props.transcription ?? "",
        "data-transcribing": props.isTranscribing ? "true" : "false",
      },
    ),
}));

vi.mock("@/components/files/FileCard", () => ({
  FileCard: (props: { file: FileMetadataRow }) =>
    React.createElement("FileCardStub", { testID: `file-${props.file.id}` }),
}));

vi.mock("@/components/notes/TextNoteCard", () => ({
  TextNoteCard: (props: {
    entry: { id?: string; text: string; addedAt: number; isPending?: boolean };
    sourceIndex: number;
    authorName: string;
    readOnly?: boolean;
    onRemove?: (sourceIndex: number) => void;
  }) =>
    React.createElement(
      "TextNoteCardStub",
      {
        testID: `text-note-stub-${props.sourceIndex}`,
        "data-source-index": props.sourceIndex,
        "data-read-only": props.readOnly ? "true" : "false",
        "data-pending": props.entry.isPending ? "true" : "false",
        "data-text": props.entry.text,
        "data-author": props.authorName,
        onRemove: props.onRemove,
      },
      // Surface author + capturedAt as inner Text nodes carrying the
      // legacy testIDs so existing `findByProps({ testID: ... })`
      // assertions keep working without poking into the real card.
      React.createElement("Text", {
        key: "author",
        testID: `text-note-author-${props.sourceIndex}`,
        children: props.authorName,
      }),
      React.createElement("Text", {
        key: "captured-at",
        testID: `text-note-captured-at-${props.sourceIndex}`,
        children: new Date(props.entry.addedAt).toISOString(),
      }),
      React.createElement("Text", {
        key: "text",
        children: props.entry.text,
      }),
    ),
}));

vi.mock("react-native-reanimated", () => {
  const React = require("react");
  const Animated = {
    View: (props: { children?: React.ReactNode; [key: string]: unknown }) =>
      React.createElement("AnimatedView", props, props.children ?? null),
  };
  return {
    __esModule: true,
    default: { ...Animated, View: Animated.View },
    FadeInDown: { duration: (ms: number) => ({ kind: "fade-in-down", ms }) },
    LinearTransition: { duration: (ms: number) => ({ kind: "linear-transition", ms }) },
  };
});

vi.mock("react-native", () => {
  const React = require("react");
  const mk = (name: string) =>
    function Stub(props: Record<string, unknown>) {
      return React.createElement(name, props, (props as { children?: React.ReactNode }).children ?? null);
    };
  return {
    View: mk("View"),
    Text: mk("Text"),
    Pressable: mk("Pressable"),
  };
});

vi.mock("lucide-react-native", () => ({
  Trash2: () => null,
  AlertCircle: () => null,
  Mic: () => null,
  MoreVertical: () => null,
}));

function makeFile(overrides: Partial<FileMetadataRow> = {}): FileMetadataRow {
  return {
    id: "f-1",
    project_id: "p-1",
    uploaded_by: "u-1",
    bucket: "project-files",
    storage_path: "project-files/p-1/f-1.m4a",
    category: "voice-note",
    filename: "voice.m4a",
    mime_type: "audio/m4a",
    size_bytes: 1024,
    duration_ms: 3000,
    deleted_at: null,
    created_at: "2026-04-28T01:00:00Z",
    updated_at: "2026-04-28T01:00:00Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("NoteTimeline component", () => {
  it("renders voice notes as VoiceNoteCard and other files as FileCard", async () => {
    const { NoteTimeline } = await import("./NoteTimeline");
    const voiceFile = makeFile({ id: "voice-1", category: "voice-note" });
    const imageFile = makeFile({
      id: "img-1",
      category: "image",
      filename: "photo.jpg",
      mime_type: "image/jpeg",
    });

    const timeline: TimelineItem[] = [
      { kind: "file", file: voiceFile },
      { kind: "file", file: imageFile },
    ];

    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        React.createElement(NoteTimeline, { timeline }),
      );
    });

    const json = JSON.stringify(renderer.toJSON());
    expect(json).toContain("voice-voice-1");
    expect(json).toContain("file-img-1");
  });

  it("wraps timeline rows in layout animations", async () => {
    const { NoteTimeline } = await import("./NoteTimeline");
    const voiceFile = makeFile({ id: "voice-1", category: "voice-note" });

    const timeline: TimelineItem[] = [
      { kind: "file", file: voiceFile },
      { kind: "text", entry: { text: "Typed note", addedAt: 1000 }, sourceIndex: 0 },
    ];

    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        React.createElement(NoteTimeline, { timeline }),
      );
    });

    const rows = renderer.root.findAllByType("AnimatedView" as any);
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.props.layout?.kind === "linear-transition")).toBe(true);
    expect(rows.every((row) => row.props.entering?.kind === "fade-in-down")).toBe(true);
  });

  it("renders text note author and captured date in the header", async () => {
    const { NoteTimeline } = await import("./NoteTimeline");

    const timeline: TimelineItem[] = [
      {
        kind: "text",
        entry: {
          id: "note-abcdef123456",
          authorId: "user-1",
          text: "Typed note",
          addedAt: Date.parse("2026-05-08T12:00:00Z"),
          source: "text",
        },
        sourceIndex: 0,
      },
    ];

    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        React.createElement(NoteTimeline, {
          timeline,
          memberNames: new Map([["user-1", "Ada Lovelace"]]),
        }),
      );
    });

    const author = renderer.root.findByProps({ testID: "text-note-author-0" });
    const date = renderer.root.findByProps({ testID: "text-note-captured-at-0" });

    expect(author.props.children).toBe("Ada Lovelace");
    expect(JSON.stringify(date.props.children)).toContain("2026");
    expect(
      renderer.root.findAllByProps({ testID: "text-note-id-0" }),
    ).toHaveLength(0);
  });

  it("falls back to author id when a text note member name is missing", async () => {
    const { NoteTimeline } = await import("./NoteTimeline");

    const timeline: TimelineItem[] = [
      {
        kind: "text",
        entry: {
          id: "note-abcdef123456",
          authorId: "user-2",
          text: "Typed note",
          addedAt: Date.parse("2026-05-08T12:00:00Z"),
          source: "text",
        },
        sourceIndex: 0,
      },
    ];

    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        React.createElement(NoteTimeline, { timeline, memberNames: new Map() }),
      );
    });

    const author = renderer.root.findByProps({ testID: "text-note-author-0" });
    expect(author.props.children).toBe("user-2");
  });

  it("renders text notes without numbered badges", async () => {
    const { NoteTimeline } = await import("./NoteTimeline");

    const timeline: TimelineItem[] = [
      {
        kind: "text",
        entry: { id: "note-second", authorId: "user-1", text: "Second typed", addedAt: 2000 },
        sourceIndex: 1,
      },
      {
        kind: "text",
        entry: { id: "note-first", authorId: "user-1", text: "First typed", addedAt: 1000 },
        sourceIndex: 0,
      },
    ];

    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        React.createElement(NoteTimeline, { timeline }),
      );
    });

    const json = JSON.stringify(renderer.toJSON());
    expect(json).toContain("Second typed");
    expect(json).toContain("First typed");
    // Index pill removed: no standalone "1"/"2" badge text should appear.
    // (Search for a Text node whose only child is the bare digit.)
    const textNodes = renderer.root.findAllByType("Text" as any);
    const badgeNumbers = textNodes
      .map((n) => (Array.isArray(n.props.children) ? n.props.children.join("") : n.props.children))
      .filter((c) => typeof c === "string" && /^\d+$/.test(c));
    expect(badgeNumbers).toEqual([]);
  });

  it("returns null when timeline is empty", async () => {
    const { NoteTimeline } = await import("./NoteTimeline");

    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        React.createElement(NoteTimeline, { timeline: [] }),
      );
    });

    expect(renderer.toJSON()).toBeNull();
  });

  it("shows loading state", async () => {
    const { NoteTimeline } = await import("./NoteTimeline");

    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        React.createElement(NoteTimeline, { timeline: [], isLoading: true }),
      );
    });

    const json = JSON.stringify(renderer.toJSON());
    expect(json).toContain("Loading");
  });

  it("shows error state", async () => {
    const { NoteTimeline } = await import("./NoteTimeline");

    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        React.createElement(NoteTimeline, {
          timeline: [],
          error: new Error("Query blew up"),
        }),
      );
    });

    const json = JSON.stringify(renderer.toJSON());
    expect(json).toContain("Query blew up");
  });

  it("forwards onRemoveNote to TextNoteCard with the correct sourceIndex", async () => {
    const { NoteTimeline } = await import("./NoteTimeline");
    const onRemoveNote = vi.fn();

    const timeline: TimelineItem[] = [
      { kind: "text", entry: { text: "remove me", addedAt: 1000 }, sourceIndex: 3 },
    ];

    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        React.createElement(NoteTimeline, { timeline, onRemoveNote }),
      );
    });

    const stub = renderer.root.findByProps({ testID: "text-note-stub-3" });
    expect(stub.props["data-source-index"]).toBe(3);
    expect(typeof stub.props.onRemove).toBe("function");
    stub.props.onRemove(3);
    expect(onRemoveNote).toHaveBeenCalledWith(3);
  });

  it("forwards readOnly to TextNoteCard", async () => {
    const { NoteTimeline } = await import("./NoteTimeline");
    const onRemoveNote = vi.fn();

    const timeline: TimelineItem[] = [
      { kind: "text", entry: { text: "keep me", addedAt: 1000 }, sourceIndex: 0 },
    ];

    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        React.createElement(NoteTimeline, { timeline, onRemoveNote, readOnly: true }),
      );
    });

    const stub = renderer.root.findByProps({ testID: "text-note-stub-0" });
    expect(stub.props["data-read-only"]).toBe("true");
  });

  it("forwards pending flag to TextNoteCard for optimistic text notes", async () => {
    const { NoteTimeline } = await import("./NoteTimeline");
    const onRemoveNote = vi.fn();

    const timeline: TimelineItem[] = [
      {
        kind: "text",
        entry: {
          id: "optimistic-note",
          authorId: "user-1",
          isPending: true,
          text: "wait for server",
          addedAt: 1000,
          source: "text",
        },
        sourceIndex: 0,
      },
    ];

    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        React.createElement(NoteTimeline, { timeline, onRemoveNote }),
      );
    });

    const stub = renderer.root.findByProps({ testID: "text-note-stub-0" });
    expect(stub.props["data-pending"]).toBe("true");
  });

  it("forwards transcription to VoiceNoteCard via transcriptionsByFileId map", async () => {
    const { NoteTimeline } = await import("./NoteTimeline");
    const voiceWithTranscript = makeFile({ id: "voice-with" });
    const voiceWithoutTranscript = makeFile({ id: "voice-without" });

    const timeline: TimelineItem[] = [
      { kind: "file", file: voiceWithTranscript },
      { kind: "file", file: voiceWithoutTranscript },
    ];

    const transcriptionsByFileId = new Map<string, string>([
      ["voice-with", "the spoken transcript"],
    ]);

    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        React.createElement(NoteTimeline, { timeline, transcriptionsByFileId }),
      );
    });

    const root = renderer.root;
    const stubs = root.findAllByType("VoiceNoteCardStub" as any);
    expect(stubs).toHaveLength(2);

    const withStub = stubs.find((s) => s.props.testID === "voice-voice-with");
    const withoutStub = stubs.find((s) => s.props.testID === "voice-voice-without");

    expect(withStub?.props["data-transcription"]).toBe("the spoken transcript");
    expect(withoutStub?.props["data-transcription"]).toBe("");
  });

  it("marks voice notes as transcribing when their file id is pending", async () => {
    const { NoteTimeline } = await import("./NoteTimeline");
    const pendingVoice = makeFile({ id: "voice-pending" });
    const idleVoice = makeFile({ id: "voice-idle" });

    const timeline: TimelineItem[] = [
      { kind: "file", file: pendingVoice },
      { kind: "file", file: idleVoice },
    ];

    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        React.createElement(NoteTimeline, {
          timeline,
          transcribingFileIds: new Set(["voice-pending"]),
        }),
      );
    });

    const stubs = renderer.root.findAllByType("VoiceNoteCardStub" as any);
    const pendingStub = stubs.find((s) => s.props.testID === "voice-voice-pending");
    const idleStub = stubs.find((s) => s.props.testID === "voice-voice-idle");

    expect(pendingStub?.props["data-transcribing"]).toBe("true");
    expect(idleStub?.props["data-transcribing"]).toBe("false");
  });
});
