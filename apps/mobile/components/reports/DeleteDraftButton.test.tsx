import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TestRenderer, { act } from "react-test-renderer";

// ---------------------------------------------------------------------------
// DeleteDraftButton: kebab → menu → "Delete Draft" → confirmation → fire.
// This is the destructive-irreversible path that the press-test gate
// requires unit coverage for. The flow is multi-step on purpose so the
// user can never delete a draft with a single misclick — the tests below
// lock that contract in place.
// ---------------------------------------------------------------------------

vi.mock("react-native", () => {
  const mk = (name: string) =>
    function Stub(
      props: Record<string, unknown> & { children?: React.ReactNode },
    ) {
      return React.createElement(name, props as object, props.children ?? null);
    };

  /**
   * The component does `anchorRef.current?.measureInWindow(cb)` to position
   * its menu. Without ref forwarding, `anchorRef.current` is null and the
   * menu never opens. Forward the ref to a no-op object that exposes
   * `measureInWindow` (which React's renderer otherwise can't simulate).
   */
  const View = React.forwardRef<
    { measureInWindow: (cb: (...a: number[]) => void) => void },
    Record<string, unknown> & { children?: React.ReactNode }
  >(function View(props, ref) {
    React.useImperativeHandle(
      ref,
      () => ({
        measureInWindow: (cb: (...a: number[]) => void) => cb(0, 0, 60, 40),
      }),
      [],
    );
    return React.createElement(
      "View",
      props as object,
      props.children ?? null,
    );
  });

  return {
    View,
    Text: mk("Text"),
    Pressable: mk("Pressable"),
    Modal: mk("Modal"),
    Dimensions: { get: () => ({ width: 375, height: 667 }) },
  };
});

vi.mock("lucide-react-native", () => ({
  MoreVertical: () => null,
  Trash2: () => null,
}));

vi.mock("@/components/ui/AppDialogSheet", () => ({
  // Keep this a stub that forwards `actions` so tests can locate the
  // confirm/cancel buttons by accessibilityLabel — same pattern used by
  // the generate-screen tests.
  AppDialogSheet: function AppDialogSheet(
    props: Record<string, unknown> & { children?: React.ReactNode },
  ) {
    return React.createElement(
      "AppDialogSheet",
      props as object,
      props.children ?? null,
    );
  },
}));

vi.mock("@/components/ui/Button", () => ({
  Button: function Button(
    props: Record<string, unknown> & { children?: React.ReactNode },
  ) {
    return React.createElement(
      "Button",
      props as object,
      props.children ?? null,
    );
  },
}));

vi.mock("@/lib/app-dialog-copy", () => ({
  getDeleteDraftDialogCopy: () => ({
    title: "Delete this draft?",
    message: "This cannot be undone.",
    tone: "danger",
    noticeTitle: "Heads up",
    confirmLabel: "Delete draft",
    confirmVariant: "destructive",
    cancelLabel: "Keep draft",
  }),
}));

vi.mock("@/lib/design-tokens/colors", () => ({
  colors: {
    foreground: "#000",
    danger: { DEFAULT: "#f00" },
  },
}));

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
});

interface DialogProbe {
  visible: boolean;
  confirm?: () => void;
  cancel?: () => void;
}

function findConfirmDialog(
  renderer: TestRenderer.ReactTestRenderer,
): DialogProbe {
  const dialogs = renderer.root.findAllByType("AppDialogSheet" as never);
  for (const node of dialogs) {
    const props = node.props as {
      visible?: boolean;
      actions?: Array<{
        accessibilityLabel?: string;
        onPress?: () => void;
      }>;
    };
    const actions = props.actions ?? [];
    const cancel = actions.find(
      (a) => a?.accessibilityLabel === "Cancel deleting draft report",
    );
    if (cancel) {
      // The confirm action's accessibilityLabel matches the button's
      // accessibilityLabel prop (which we don't override in the test, so
      // it's the default "Delete draft report"). Find it as "the action
      // that isn't cancel".
      const confirm = actions.find((a) => a !== cancel);
      return {
        visible: props.visible === true,
        confirm: confirm?.onPress,
        cancel: cancel.onPress,
      };
    }
  }
  return { visible: false };
}

describe("DeleteDraftButton", () => {
  it("renders the kebab button with testID='btn-draft-menu'", async () => {
    const { DeleteDraftButton } = await import("./DeleteDraftButton");
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        React.createElement(DeleteDraftButton, {
          isDeleting: false,
          onConfirmDelete: vi.fn(),
        }),
      );
    });
    const kebab = renderer.root.findByProps({ testID: "btn-draft-menu" });
    expect(kebab).toBeDefined();
    expect((kebab.props as { disabled?: boolean }).disabled).toBe(false);
  });

  it("pressing btn-draft-menu opens the menu (Modal visible=true)", async () => {
    const { DeleteDraftButton } = await import("./DeleteDraftButton");
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        React.createElement(DeleteDraftButton, {
          isDeleting: false,
          onConfirmDelete: vi.fn(),
        }),
      );
    });

    const modalsBefore = renderer.root.findAllByType("Modal" as never);
    expect(modalsBefore[0]!.props.visible).toBe(false);

    act(() => {
      (
        renderer.root.findByProps({ testID: "btn-draft-menu" }).props as {
          onPress: () => void;
        }
      ).onPress();
    });

    const modalsAfter = renderer.root.findAllByType("Modal" as never);
    expect(modalsAfter[0]!.props.visible).toBe(true);
  });

  it("pressing btn-delete-draft inside the open menu opens the confirmation dialog (does NOT fire onConfirmDelete yet)", async () => {
    const onConfirmDelete = vi.fn();
    const { DeleteDraftButton } = await import("./DeleteDraftButton");
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        React.createElement(DeleteDraftButton, {
          isDeleting: false,
          onConfirmDelete,
        }),
      );
    });

    // 1. Open menu
    act(() => {
      (
        renderer.root.findByProps({ testID: "btn-draft-menu" }).props as {
          onPress: () => void;
        }
      ).onPress();
    });

    // 2. Press the Delete Draft entry inside the menu
    const deleteEntry = renderer.root.findByProps({
      testID: "btn-delete-draft",
    });
    act(() => {
      (deleteEntry.props as { onPress: () => void }).onPress();
    });

    // The handler is two-step: select-delete sets isConfirmVisible=true.
    // It must NOT call onConfirmDelete yet — that only happens on the
    // dialog's confirm action below.
    expect(onConfirmDelete).not.toHaveBeenCalled();
    expect(findConfirmDialog(renderer).visible).toBe(true);
  });

  it("pressing the dialog's Confirm action invokes onConfirmDelete and closes the dialog", async () => {
    const onConfirmDelete = vi.fn();
    const { DeleteDraftButton } = await import("./DeleteDraftButton");
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        React.createElement(DeleteDraftButton, {
          isDeleting: false,
          onConfirmDelete,
        }),
      );
    });

    act(() => {
      (
        renderer.root.findByProps({ testID: "btn-draft-menu" }).props as {
          onPress: () => void;
        }
      ).onPress();
    });
    act(() => {
      (
        renderer.root.findByProps({ testID: "btn-delete-draft" }).props as {
          onPress: () => void;
        }
      ).onPress();
    });

    const dialog = findConfirmDialog(renderer);
    expect(dialog.visible).toBe(true);
    act(() => {
      dialog.confirm!();
    });

    expect(onConfirmDelete).toHaveBeenCalledOnce();
    expect(findConfirmDialog(renderer).visible).toBe(false);
  });

  it("pressing the dialog's Cancel action closes the dialog WITHOUT calling onConfirmDelete", async () => {
    const onConfirmDelete = vi.fn();
    const { DeleteDraftButton } = await import("./DeleteDraftButton");
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        React.createElement(DeleteDraftButton, {
          isDeleting: false,
          onConfirmDelete,
        }),
      );
    });

    act(() => {
      (
        renderer.root.findByProps({ testID: "btn-draft-menu" }).props as {
          onPress: () => void;
        }
      ).onPress();
    });
    act(() => {
      (
        renderer.root.findByProps({ testID: "btn-delete-draft" }).props as {
          onPress: () => void;
        }
      ).onPress();
    });

    const dialog = findConfirmDialog(renderer);
    act(() => {
      dialog.cancel!();
    });

    expect(onConfirmDelete).not.toHaveBeenCalled();
    expect(findConfirmDialog(renderer).visible).toBe(false);
  });

  it("kebab button is disabled while a delete is in flight (isDeleting=true)", async () => {
    const { DeleteDraftButton } = await import("./DeleteDraftButton");
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        React.createElement(DeleteDraftButton, {
          isDeleting: true,
          onConfirmDelete: vi.fn(),
        }),
      );
    });
    const kebab = renderer.root.findByProps({ testID: "btn-draft-menu" });
    expect((kebab.props as { disabled?: boolean }).disabled).toBe(true);
  });

  it("renders extraActions inside the menu and invokes their onPress on tap", async () => {
    const onAddDoc = vi.fn();
    const onAddPhoto = vi.fn();
    const { DeleteDraftButton } = await import("./DeleteDraftButton");
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        React.createElement(DeleteDraftButton, {
          isDeleting: false,
          onConfirmDelete: vi.fn(),
          extraActions: [
            {
              key: "add-document",
              label: "Add document",
              icon: null,
              onPress: onAddDoc,
              testID: "btn-menu-add-document",
            },
            {
              key: "add-photo",
              label: "Add photo",
              icon: null,
              onPress: onAddPhoto,
              testID: "btn-menu-add-photo",
            },
          ],
        }),
      );
    });

    act(() => {
      (
        renderer.root.findByProps({ testID: "btn-draft-menu" }).props as {
          onPress: () => void;
        }
      ).onPress();
    });

    const docEntry = renderer.root.findByProps({
      testID: "btn-menu-add-document",
    });
    act(() => {
      (docEntry.props as { onPress: () => void }).onPress();
    });

    expect(onAddDoc).toHaveBeenCalledOnce();
    expect(onAddPhoto).not.toHaveBeenCalled();
    // Menu auto-closes after picking an extra action.
    const modal = renderer.root.findAllByType("Modal" as never)[0]!;
    expect(modal.props.visible).toBe(false);
  });
});
