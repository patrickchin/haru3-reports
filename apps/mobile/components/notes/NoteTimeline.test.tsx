import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TestRenderer, { act } from "react-test-renderer";
import type { TimelineItem } from "@/hooks/useNoteTimeline";
import type { FileMetadataRow } from "@/lib/file-upload";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
vi.mock("@/components/voice-notes/VoiceNoteCard", () => ({
  VoiceNoteCard: (props: { file: FileMetadataRow }) =>
    React.createElement("VoiceNoteCardStub", { testID: `voice-${props.file.id}` }),
}));

vi.mock("@/components/files/FileCard", () => ({
  FileCard: (props: { file: FileMetadataRow }) =>
    React.createElement("FileCardStub", { testID: `file-${props.file.id}` }),
}));

vi.mock("react-native-reanimated", () => {
  const React = require("react");
  const Animated = {
    View: (props: { children?: React.ReactNode }) =>
      React.createElement("AnimatedView", null, props.children ?? null),
  };
  return {
    __esModule: true,
    default: { ...Animated, View: Animated.View },
    FadeInDown: { duration: () => ({ duration: () => ({}) }) },
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
  X: () => null,
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
    transcription: null,
    report_id: null,
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

  it("renders text notes with numbered badges", async () => {
    const { NoteTimeline } = await import("./NoteTimeline");

    const timeline: TimelineItem[] = [
      { kind: "text", entry: { text: "Second typed", addedAt: 2000 }, sourceIndex: 1 },
      { kind: "text", entry: { text: "First typed", addedAt: 1000 }, sourceIndex: 0 },
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
    // Display numbers: first added = 1, second added = 2
    expect(json).toContain('"1"');
    expect(json).toContain('"2"');
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

  it("calls onRemoveNote with the correct sourceIndex", async () => {
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

    // Find the Pressable with onPress for removal
    const root = renderer.root;
    const pressables = root.findAllByType("Pressable" as any);
    const removeButton = pressables.find((p) => p.props.onPress);
    expect(removeButton).toBeDefined();
    removeButton!.props.onPress();
    expect(onRemoveNote).toHaveBeenCalledWith(3);
  });

  it("hides remove button when readOnly", async () => {
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

    const root = renderer.root;
    const pressables = root.findAllByType("Pressable" as any);
    // No pressable with onPress pointing to remove
    expect(pressables.length).toBe(0);
  });
});
