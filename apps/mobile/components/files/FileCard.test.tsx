import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TestRenderer, { act } from "react-test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Mock backend so getSignedUrl can be observed via vi.fn().
const createSignedUrlMock = vi.fn();
const removeMock = vi.fn();
const fromMetadataMock = vi.fn();

vi.mock("@/lib/backend", () => ({
  backend: {
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn(),
        remove: removeMock,
        createSignedUrl: createSignedUrlMock,
        getPublicUrl: vi.fn(() => ({ data: { publicUrl: "" } })),
      })),
    },
    from: (...args: unknown[]) => fromMetadataMock(...args),
  },
}));

// Stub native modules that the components transitively depend on.
vi.mock("lucide-react-native", () => ({
  FileText: () => null,
  Image: () => null,
  Mic: () => null,
  Paperclip: () => null,
  Trash2: () => null,
  Play: () => null,
  Pause: () => null,
}));

vi.mock("@/components/ui/Card", () => ({
  Card: ({ children }: { children: React.ReactNode }) =>
    React.createElement("View", null, children),
}));

// Stub AppDialogSheet (uses RN Modal which isn't available in the node
// test env). Render nothing — these tests don't exercise delete confirm UI.
vi.mock("@/components/ui/AppDialogSheet", () => ({
  AppDialogSheet: () => null,
}));

// Stub the hooks module so expo-file-system isn't transitively imported in
// the node test env. Only useDeleteFile is consumed by FileCard.
vi.mock("@/hooks/useProjectFiles", () => ({
  useDeleteFile: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("react-native", async () => {
  const actual: Record<string, unknown> = {};
  // Minimal RN host primitives mapped to plain elements for the renderer.
  const mk = (name: string) =>
    function Stub(props: { children?: React.ReactNode }) {
      return React.createElement(name, null, props.children ?? null);
    };
  return {
    ...actual,
    View: mk("View"),
    Text: mk("Text"),
    Pressable: ({ children, onPress, disabled }: any) =>
      React.createElement(
        "Pressable",
        { onPress, disabled },
        typeof children === "function" ? children({ pressed: false }) : children,
      ),
    ActivityIndicator: () => null,
    Alert: { alert: vi.fn() },
  };
});

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
});

afterEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
});

function renderWithClient(node: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  let renderer: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      React.createElement(QueryClientProvider, { client }, node),
    );
  });
  return { renderer: renderer!, client };
}

describe("FileCard.handleOpen", () => {
  it("invokes onOpen synchronously with the file on tap (no URL fetch in handler)", async () => {
    const { FileCard } = await import("./FileCard");
    const file = {
      id: "f-1",
      project_id: "p-1",
      uploaded_by: "u-1",
      bucket: "project-files",
      storage_path: "p-1/documents/abc.pdf",
      category: "document" as const,
      filename: "spec.pdf",
      mime_type: "application/pdf",
      size_bytes: 1024,
      duration_ms: null,
      deleted_at: null,
      created_at: "2026-04-27T00:00:00Z",
      updated_at: "2026-04-27T00:00:00Z",
    };
    const onOpen = vi.fn();

    const { renderer } = renderWithClient(
      React.createElement(FileCard, { file, onOpen }),
    );

    // Find the body Pressable (the one with onPress wired to handleOpen).
    const pressables = renderer.root.findAllByType("Pressable" as any);
    const bodyPress = pressables.find((p) => typeof p.props.onPress === "function" && !p.props.disabled);
    expect(bodyPress).toBeDefined();

    act(() => {
      bodyPress!.props.onPress();
    });

    // The handler must fire synchronously with just the file — the
    // parent owns URL resolution so the preview UI can open instantly.
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith(file);
    // For non-image files there is no render-time prefetch, so
    // getSignedUrl must not be called either.
    expect(createSignedUrlMock).not.toHaveBeenCalled();
  });

  it("does not call onOpen or fetch when no handler is provided", async () => {
    const { FileCard } = await import("./FileCard");
    const file = {
      id: "f-2",
      project_id: "p-1",
      uploaded_by: "u-1",
      bucket: "project-files",
      storage_path: "p-1/documents/x.pdf",
      category: "document" as const,
      filename: "x.pdf",
      mime_type: "application/pdf",
      size_bytes: 100,
      duration_ms: null,
      deleted_at: null,
      created_at: "",
      updated_at: "",
    };

    const { renderer } = renderWithClient(
      React.createElement(FileCard, { file }),
    );
    const pressables = renderer.root.findAllByType("Pressable" as any);
    const bodyPress = pressables.find((p) => typeof p.props.onPress === "function");
    act(() => {
      bodyPress!.props.onPress();
    });

    expect(createSignedUrlMock).not.toHaveBeenCalled();
  });
});

describe("FileCard (image)", () => {
  const imageFile = {
    id: "img-1",
    project_id: "p-1",
    uploaded_by: "u-1",
    bucket: "project-files",
    storage_path: "p-1/images/abc.jpg",
    thumbnail_path: "p-1/thumbs/abc.jpg",
    category: "image" as const,
    filename: "550e8400-e29b-41d4-a716-446655440000.jpg",
    mime_type: "image/jpeg",
    size_bytes: 50_000,
    duration_ms: null,
    deleted_at: null,
    created_at: "2026-04-27T00:00:00Z",
    updated_at: "2026-04-27T00:00:00Z",
    width: 100,
    height: 100,
    blurhash: null,
  };

  it("shows author and capturedAt, hides the UUID-style filename", async () => {
    const { FileCard } = await import("./FileCard");
    const { renderer } = renderWithClient(
      React.createElement(FileCard, {
        file: imageFile,
        onOpen: vi.fn(),
        authorName: "Alice",
        capturedAt: "2026-04-27T10:30:00Z",
      }),
    );

    const author = renderer.root.findByProps({ testID: "file-author-img-1" });
    expect(String(author.props.children)).toBe("Alice");

    const stamp = renderer.root.findByProps({
      testID: "file-captured-at-img-1",
    });
    const stampText = String(stamp.props.children);
    expect(stampText).toContain("2026");
    expect(/Apr|27/.test(stampText)).toBe(true);

    // The UUID filename must not appear anywhere in the rendered tree.
    const json = JSON.stringify(renderer.toJSON());
    expect(json).not.toContain(imageFile.filename);
    expect(json).not.toContain("550e8400");
  });

  it("makes the whole body (thumbnail + author + timestamp) one pressable that opens the photo", async () => {
    const { FileCard } = await import("./FileCard");
    const onOpen = vi.fn();
    const { renderer } = renderWithClient(
      React.createElement(FileCard, {
        file: imageFile,
        onOpen,
        authorName: "Alice",
        capturedAt: "2026-04-27T10:30:00Z",
      }),
    );

    const opener = renderer.root.findByProps({
      testID: "btn-open-file-img-1",
    });
    expect(opener).toBeDefined();
    // Captured-at and author live inside the opener pressable, so tapping
    // anywhere on the body — thumbnail or text area — opens the viewer.
    expect(opener.findAllByProps({ testID: "file-captured-at-img-1" }).length)
      .toBe(1);
    expect(opener.findAllByProps({ testID: "file-author-img-1" }).length).toBe(1);
    // Delete button is a sibling, not a descendant of the opener.
    expect(opener.findAllByProps({ testID: "btn-delete-file-img-1" }).length)
      .toBe(0);

    act(() => {
      opener.props.onPress();
    });
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith(imageFile);
  });
});
