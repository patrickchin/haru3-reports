import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TestRenderer, { act } from "react-test-renderer";

vi.mock("lucide-react-native", () => ({
  Pencil: () => React.createElement("PencilIcon"),
  Check: () => React.createElement("CheckIcon"),
  X: () => React.createElement("XIcon"),
}));

vi.mock("react-native", () => {
  const mk = (name: string) =>
    function Stub(props: { children?: React.ReactNode; [key: string]: unknown }) {
      return React.createElement(name, props, props.children ?? null);
    };
  return {
    View: mk("View"),
    Pressable: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement("Pressable", props, children ?? null),
  };
});

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

function findHost(
  renderer: TestRenderer.ReactTestRenderer,
  testID: string,
) {
  const matches = renderer.root.findAllByProps({ testID });
  const host = matches.find((m) => typeof m.type === "string");
  if (!host) throw new Error(`No host node with testID=${testID}`);
  return host;
}

describe("CardEditButtons", () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  });
  afterEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = false;
  });

  it("renders pencil button when not editing", async () => {
    const { CardEditButtons } = await import("./CardEditButtons");
    const onEdit = vi.fn();
    const onSave = vi.fn();
    const onCancel = vi.fn();
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <CardEditButtons
          isEditing={false}
          onEdit={onEdit}
          onSave={onSave}
          onCancel={onCancel}
          testID="card"
        />,
      );
    });
    const json = JSON.stringify(renderer.toJSON());
    expect(json).toContain("PencilIcon");
    expect(json).not.toContain("CheckIcon");
    expect(json).not.toContain("XIcon");

    act(() => findHost(renderer, "card-edit").props.onPress());
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("renders check + x buttons when editing and wires callbacks", async () => {
    const { CardEditButtons } = await import("./CardEditButtons");
    const onEdit = vi.fn();
    const onSave = vi.fn();
    const onCancel = vi.fn();
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <CardEditButtons
          isEditing
          onEdit={onEdit}
          onSave={onSave}
          onCancel={onCancel}
          testID="card"
        />,
      );
    });
    const json = JSON.stringify(renderer.toJSON());
    expect(json).toContain("CheckIcon");
    expect(json).toContain("XIcon");
    expect(json).not.toContain("PencilIcon");

    act(() => findHost(renderer, "card-save").props.onPress());
    expect(onSave).toHaveBeenCalledTimes(1);

    act(() => findHost(renderer, "card-cancel").props.onPress());
    expect(onCancel).toHaveBeenCalledTimes(1);

    expect(onEdit).not.toHaveBeenCalled();
  });
});
