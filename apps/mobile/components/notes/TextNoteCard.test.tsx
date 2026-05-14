import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TestRenderer, { act } from "react-test-renderer";

const copyMock = vi.fn();

vi.mock("@/hooks/useCopyToClipboard", () => ({
  useCopyToClipboard: () => ({ copy: copyMock, isCopied: () => false, copiedKey: null }),
}));

vi.mock("lucide-react-native", () => ({
  MoreVertical: () => React.createElement("MoreVerticalIcon"),
}));

vi.mock("@/components/ui/Card", () => ({
  Card: ({ children, className }: { children: React.ReactNode; className?: string }) =>
    React.createElement("Card", { className }, children),
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
  };
});

vi.mock("@/components/ui/AppDialogSheet", () => ({
  AppDialogSheet: (props: {
    visible: boolean;
    title: string;
    actions?: { label: string; onPress: () => void; testID?: string; disabled?: boolean }[];
    children?: React.ReactNode;
  }) =>
    props.visible
      ? React.createElement(
          "AppDialogSheet",
          { testID: `dialog-sheet:${props.title}`, title: props.title },
          props.children ?? null,
          ...((props.actions ?? []).map((a, i) =>
            React.createElement(
              "Pressable",
              {
                key: a.testID ?? `dialog-action-${i}`,
                testID: a.testID ?? `dialog-action-${i}`,
                onPress: a.onPress,
                disabled: a.disabled,
              },
              React.createElement("Text", null, a.label),
            ),
          )),
        )
      : null,
}));

vi.mock("@/lib/app-dialog-copy", () => ({
  getDeleteNoteDialogCopy: () => ({
    title: "Delete Note",
    message: "Are you sure?",
    tone: "danger",
    noticeTitle: "Permanent action",
    confirmLabel: "Delete",
    cancelLabel: "Cancel",
    confirmVariant: "destructive",
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function renderCard(props: {
  entry: {
    id?: string;
    text: string;
    addedAt: number;
    isPending?: boolean;
    authorId?: string;
  };
  sourceIndex?: number;
  authorName?: string;
  readOnly?: boolean;
  onRemove?: (i: number) => void;
}) {
  const { TextNoteCard } = await import("./TextNoteCard");
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      React.createElement(TextNoteCard, {
        sourceIndex: 0,
        authorName: "Ada Lovelace",
        ...props,
      }),
    );
  });
  return renderer;
}

describe("TextNoteCard", () => {
  it("renders author, captured-at, and note text", async () => {
    const renderer = await renderCard({
      entry: { text: "Hello world", addedAt: Date.parse("2026-05-08T12:00:00Z") },
    });
    const json = JSON.stringify(renderer.toJSON());
    expect(json).toContain("Ada Lovelace");
    expect(json).toContain("Hello world");
    expect(json).toContain("2026");
  });

  it("shows the three-dot options button when manageable", async () => {
    const renderer = await renderCard({
      entry: { text: "Hello", addedAt: 1000 },
      onRemove: vi.fn(),
    });
    expect(
      renderer.root.findAllByProps({ testID: "btn-text-note-options-0" }).length,
    ).toBeGreaterThan(0);
  });

  it("hides the options button when readOnly", async () => {
    const renderer = await renderCard({
      entry: { text: "Hello", addedAt: 1000 },
      onRemove: vi.fn(),
      readOnly: true,
    });
    expect(
      renderer.root.findAllByProps({ testID: "btn-text-note-options-0" }),
    ).toHaveLength(0);
  });

  it("hides the options button for pending optimistic notes and shows a spinner", async () => {
    const renderer = await renderCard({
      entry: { text: "Hello", addedAt: 1000, isPending: true },
      onRemove: vi.fn(),
    });
    expect(
      renderer.root.findAllByProps({ testID: "btn-text-note-options-0" }),
    ).toHaveLength(0);
    expect(
      renderer.root.findAllByProps({ testID: "text-note-pending-0" }).length,
    ).toBeGreaterThan(0);
  });

  it("hides the options button when no onRemove handler is wired up", async () => {
    const renderer = await renderCard({
      entry: { text: "Hello", addedAt: 1000 },
    });
    expect(
      renderer.root.findAllByProps({ testID: "btn-text-note-options-0" }),
    ).toHaveLength(0);
  });

  it("opens the options dialog and exposes copy + delete actions", async () => {
    const onRemove = vi.fn();
    const renderer = await renderCard({
      entry: { id: "note-123", text: "Hello world", addedAt: 1000 },
      onRemove,
    });

    const button = renderer.root.findByProps({
      testID: "btn-text-note-options-0",
    });
    act(() => {
      button.props.onPress();
    });

    expect(
      renderer.root.findAllByProps({ testID: "dialog-action-text-note-copy-0" }).length,
    ).toBeGreaterThan(0);
    expect(
      renderer.root.findAllByProps({ testID: "dialog-action-text-note-delete-0" }).length,
    ).toBeGreaterThan(0);
  });

  it("copies the note text from the dialog action and closes the sheet", async () => {
    const renderer = await renderCard({
      entry: { text: "  copy me please  ", addedAt: 1000 },
      onRemove: vi.fn(),
    });

    act(() => {
      renderer.root.findByProps({ testID: "btn-text-note-options-0" }).props.onPress();
    });
    act(() => {
      renderer.root
        .findByProps({ testID: "dialog-action-text-note-copy-0" })
        .props.onPress();
    });

    expect(copyMock).toHaveBeenCalledWith("copy me please", { toast: "Note copied" });
    // Sheet should close.
    expect(
      renderer.root.findAllByProps({ testID: "dialog-action-text-note-copy-0" }),
    ).toHaveLength(0);
  });

  it("Delete in options opens the confirm dialog and calls onRemove on confirm", async () => {
    const onRemove = vi.fn();
    const renderer = await renderCard({
      entry: { text: "doomed", addedAt: 1000 },
      sourceIndex: 5,
      onRemove,
    });

    act(() => {
      renderer.root.findByProps({ testID: "btn-text-note-options-5" }).props.onPress();
    });
    act(() => {
      renderer.root
        .findByProps({ testID: "dialog-action-text-note-delete-5" })
        .props.onPress();
    });

    expect(onRemove).not.toHaveBeenCalled();
    act(() => {
      renderer.root
        .findByProps({ testID: "dialog-action-text-note-confirm-delete-5" })
        .props.onPress();
    });
    expect(onRemove).toHaveBeenCalledWith(5);
  });

  it("does not surface Delete in the options sheet when readOnly", async () => {
    const renderer = await renderCard({
      entry: { text: "Hello", addedAt: 1000 },
      onRemove: vi.fn(),
      readOnly: true,
    });
    // No options button is rendered, so no way to open the sheet —
    // the Delete action also does not exist.
    expect(
      renderer.root.findAllByProps({ testID: "dialog-action-text-note-delete-0" }),
    ).toHaveLength(0);
  });

  it("includes ID metadata row only when entry.id is set", async () => {
    const withId = await renderCard({
      entry: { id: "note-abc", text: "x", addedAt: 1000 },
      onRemove: vi.fn(),
    });
    act(() => {
      withId.root.findByProps({ testID: "btn-text-note-options-0" }).props.onPress();
    });
    expect(
      withId.root.findAllByProps({ testID: "text-note-options-id-0" }).length,
    ).toBeGreaterThan(0);

    const withoutId = await renderCard({
      entry: { text: "x", addedAt: 1000 },
      onRemove: vi.fn(),
    });
    act(() => {
      withoutId.root.findByProps({ testID: "btn-text-note-options-0" }).props.onPress();
    });
    expect(
      withoutId.root.findAllByProps({ testID: "text-note-options-id-0" }),
    ).toHaveLength(0);
  });
});
