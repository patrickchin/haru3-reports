import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TestRenderer, { act } from "react-test-renderer";
import {
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import type { NoteEntry } from "@/lib/note-entry";
import type { FileMetadataRow } from "@/lib/file-upload";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
const useProjectFilesMock = vi.fn();

vi.mock("@/hooks/useProjectFiles", () => ({
  useProjectFiles: (...args: unknown[]) => useProjectFilesMock(...args),
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

// Minimal wrapper to provide QueryClient
function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client: qc }, children);
}

// The hook under test — dynamically imported after mocks are in place
async function getHook() {
  const mod = await import("./useNoteTimeline");
  return mod.useNoteTimeline;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useNoteTimeline", () => {
  it("merges text notes and linked files sorted newest-first", async () => {
    const voiceFile = makeFile({
      id: "f-voice",
      category: "voice-note",
      created_at: "2026-04-28T01:00:05Z",
    });
    const imageFile = makeFile({
      id: "f-image",
      category: "image",
      filename: "photo.jpg",
      mime_type: "image/jpeg",
      created_at: "2026-04-28T01:00:10Z",
    });

    useProjectFilesMock.mockReturnValue({
      data: [imageFile, voiceFile],
      isLoading: false,
      error: null,
    });

    const useNoteTimeline = await getHook();
    const notes: NoteEntry[] = [
      { text: "first note", addedAt: Date.parse("2026-04-28T01:00:00Z"), source: "text" },
      { text: "second note", addedAt: Date.parse("2026-04-28T01:00:08Z"), source: "text" },
    ];
    const linkedFileIds = new Set(["f-voice", "f-image"]);

    let result: ReturnType<typeof useNoteTimeline> | undefined;
    function TestComponent() {
      result = useNoteTimeline({ notes, projectId: "p-1", linkedFileIds });
      return null;
    }

    act(() => {
      TestRenderer.create(
        React.createElement(Wrapper, null, React.createElement(TestComponent)),
      );
    });

    expect(result).toBeDefined();
    expect(result!.timeline).toHaveLength(4);

    // Newest first: image (10s) > second note (8s) > voice (5s) > first note (0s)
    expect(result!.timeline[0]).toMatchObject({ kind: "file" });
    expect((result!.timeline[0] as { kind: "file"; file: FileMetadataRow }).file.id).toBe("f-image");

    expect(result!.timeline[1]).toMatchObject({ kind: "text" });
    expect((result!.timeline[1] as { kind: "text"; entry: NoteEntry }).entry.text).toBe("second note");

    expect(result!.timeline[2]).toMatchObject({ kind: "file" });
    expect((result!.timeline[2] as { kind: "file"; file: FileMetadataRow }).file.id).toBe("f-voice");

    expect(result!.timeline[3]).toMatchObject({ kind: "text" });
    expect((result!.timeline[3] as { kind: "text"; entry: NoteEntry }).entry.text).toBe("first note");
  });

  it("omits files that are NOT in linkedFileIds (no time-window fallback)", async () => {
    // Regression guard: a file uploaded after the report's created_at must
    // still be excluded if it has no `report_notes` link. The previous
    // behaviour included it via a time-window fallback, which let orphan
    // file_metadata rows leak into the report UI.
    const orphan = makeFile({
      id: "file-orphan",
      created_at: "2026-04-28T02:00:00Z",
    });

    useProjectFilesMock.mockReturnValue({
      data: [orphan],
      isLoading: false,
      error: null,
    });

    const useNoteTimeline = await getHook();

    let result: ReturnType<typeof useNoteTimeline> | undefined;
    function TestComponent() {
      result = useNoteTimeline({
        notes: [],
        projectId: "p-1",
        reportCreatedAt: "2026-04-28T00:00:00Z",
        linkedFileIds: new Set<string>(),
      });
      return null;
    }

    act(() => {
      TestRenderer.create(
        React.createElement(Wrapper, null, React.createElement(TestComponent)),
      );
    });

    expect(result!.timeline).toHaveLength(0);
  });

  it("excludes voice-sourced text notes from the timeline", async () => {
    useProjectFilesMock.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    });

    const useNoteTimeline = await getHook();
    const notes: NoteEntry[] = [
      { text: "typed note", addedAt: 1000, source: "text" },
      { text: "voice transcription", addedAt: 2000, source: "voice" },
    ];

    let result: ReturnType<typeof useNoteTimeline> | undefined;
    function TestComponent() {
      result = useNoteTimeline({ notes, projectId: "p-1" });
      return null;
    }

    act(() => {
      TestRenderer.create(
        React.createElement(Wrapper, null, React.createElement(TestComponent)),
      );
    });

    expect(result!.timeline).toHaveLength(1);
    expect((result!.timeline[0] as { kind: "text"; entry: NoteEntry }).entry.text).toBe("typed note");
  });

  it("returns loading state from useProjectFiles", async () => {
    useProjectFilesMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    });

    const useNoteTimeline = await getHook();

    let result: ReturnType<typeof useNoteTimeline> | undefined;
    function TestComponent() {
      result = useNoteTimeline({ notes: [], projectId: "p-1" });
      return null;
    }

    act(() => {
      TestRenderer.create(
        React.createElement(Wrapper, null, React.createElement(TestComponent)),
      );
    });

    expect(result!.isLoading).toBe(true);
    expect(result!.timeline).toHaveLength(0);
  });

  it("surfaces errors from useProjectFiles", async () => {
    useProjectFilesMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error("Network failed"),
    });

    const useNoteTimeline = await getHook();

    let result: ReturnType<typeof useNoteTimeline> | undefined;
    function TestComponent() {
      result = useNoteTimeline({ notes: [], projectId: "p-1" });
      return null;
    }

    act(() => {
      TestRenderer.create(
        React.createElement(Wrapper, null, React.createElement(TestComponent)),
      );
    });

    expect(result!.error).toBeInstanceOf(Error);
    expect(result!.error!.message).toBe("Network failed");
  });

  it("includes only files explicitly linked via report_notes (linkedFileIds)", async () => {
    const oldLinkedFile = makeFile({
      id: "f-old-linked",
      created_at: "2026-04-27T12:00:00Z", // before report
    });
    const oldUnlinkedFile = makeFile({
      id: "f-old-unlinked",
      created_at: "2026-04-27T13:00:00Z",
    });
    const newUnlinkedFile = makeFile({
      id: "f-new-unlinked",
      created_at: "2026-04-28T02:00:00Z", // after report
    });

    useProjectFilesMock.mockReturnValue({
      data: [oldLinkedFile, oldUnlinkedFile, newUnlinkedFile],
      isLoading: false,
      error: null,
    });

    const useNoteTimeline = await getHook();
    const linkedFileIds = new Set(["f-old-linked"]);

    let result: ReturnType<typeof useNoteTimeline> | undefined;
    function TestComponent() {
      result = useNoteTimeline({
        notes: [],
        projectId: "p-1",
        reportCreatedAt: "2026-04-28T00:00:00Z",
        linkedFileIds,
      });
      return null;
    }

    act(() => {
      TestRenderer.create(
        React.createElement(Wrapper, null, React.createElement(TestComponent)),
      );
    });

    // Only the linked file is rendered. The new-but-unlinked file (which
    // would have leaked under the old time-window fallback) is excluded.
    const fileIds = result!.timeline
      .filter((t): t is { kind: "file"; file: FileMetadataRow } => t.kind === "file")
      .map((t) => t.file.id);
    expect(fileIds).toEqual(["f-old-linked"]);
  });

  it("excludes files claimed by other reports", async () => {
    // file-A is linked to a different report in the same project. Even if
    // it somehow ended up in linkedFileIds for this report (defensive),
    // excludedFileIds wins.
    const otherReportFile = makeFile({
      id: "file-A",
      created_at: "2026-04-28T02:00:00Z",
    });
    const ownFile = makeFile({
      id: "file-own",
      created_at: "2026-04-28T03:00:00Z",
    });

    useProjectFilesMock.mockReturnValue({
      data: [otherReportFile, ownFile],
      isLoading: false,
      error: null,
    });

    const useNoteTimeline = await getHook();
    const linkedFileIds = new Set(["file-own"]);
    const excludedFileIds = new Set(["file-A"]);

    let result: ReturnType<typeof useNoteTimeline> | undefined;
    function TestComponent() {
      result = useNoteTimeline({
        notes: [],
        projectId: "p-1",
        reportCreatedAt: "2026-04-28T00:00:00Z",
        linkedFileIds,
        excludedFileIds,
      });
      return null;
    }

    act(() => {
      TestRenderer.create(
        React.createElement(Wrapper, null, React.createElement(TestComponent)),
      );
    });

    const fileIds = result!.timeline
      .filter((t): t is { kind: "file"; file: FileMetadataRow } => t.kind === "file")
      .map((t) => t.file.id);
    expect(fileIds).toEqual(["file-own"]);
    expect(fileIds).not.toContain("file-A");
  });

  it("excludedFileIds wins over linkedFileIds", async () => {
    // Defensive: if a file id appears in both sets (shouldn't happen, but
    // protects against bad upstream data), the exclusion takes precedence.
    const file = makeFile({ id: "file-X" });

    useProjectFilesMock.mockReturnValue({
      data: [file],
      isLoading: false,
      error: null,
    });

    const useNoteTimeline = await getHook();
    let result: ReturnType<typeof useNoteTimeline> | undefined;
    function TestComponent() {
      result = useNoteTimeline({
        notes: [],
        projectId: "p-1",
        linkedFileIds: new Set(["file-X"]),
        excludedFileIds: new Set(["file-X"]),
      });
      return null;
    }

    act(() => {
      TestRenderer.create(
        React.createElement(Wrapper, null, React.createElement(TestComponent)),
      );
    });

    expect(result!.timeline).toHaveLength(0);
  });
});
