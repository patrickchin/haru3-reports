import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TestRenderer, { act } from "react-test-renderer";

const onChangeMock = vi.fn();

vi.mock("lucide-react-native", () => ({
  Pencil: () => React.createElement("PencilIcon"),
  Check: () => React.createElement("CheckIcon"),
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
    TextInput: (props: Record<string, unknown>) =>
      React.createElement("TextInput", props),
  };
});

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

// `findByProps({ testID })` matches both the EditableField React element AND
// its rendered host node, because we forward testID. Pick the host (string-typed)
// instance.
function findHost(
  renderer: TestRenderer.ReactTestRenderer,
  testID: string,
) {
  const matches = renderer.root.findAllByProps({ testID });
  const host = matches.find((m) => typeof m.type === "string");
  if (!host) throw new Error(`No host node with testID=${testID}`);
  return host;
}

describe("EditableField", () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    onChangeMock.mockClear();
  });

  afterEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = false;
  });

  it("renders plain Text when not editable", async () => {
    const { EditableField } = await import("./EditableField");
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <EditableField
          value="Hello"
          onChange={onChangeMock}
          testID="f1"
        />,
      );
    });
    const json = JSON.stringify(renderer.toJSON());
    expect(json).toContain("Hello");
    // No Pressable / no PencilIcon when not editable
    expect(json).not.toContain("PencilIcon");
    expect(json).not.toContain("TextInput");
  });

  it("shows emptyDisplay when value is '' and not editing", async () => {
    const { EditableField } = await import("./EditableField");
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <EditableField
          value=""
          onChange={onChangeMock}
          editable
          emptyDisplay="—"
          testID="f2"
        />,
      );
    });
    const json = JSON.stringify(renderer.toJSON());
    expect(json).toContain("—");
  });

  it("tap enters edit mode and shows TextInput with current value", async () => {
    const { EditableField } = await import("./EditableField");
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <EditableField
          value="Initial"
          onChange={onChangeMock}
          editable
          testID="f3"
        />,
      );
    });
    const wrapper = findHost(renderer, "f3");
    act(() => {
      (wrapper.props.onPress as () => void)();
    });
    const input = findHost(renderer, "f3-input");
    expect(input.props.value).toBe("Initial");
  });

  it("typing updates draft; save button calls onChange(draft) and exits edit mode", async () => {
    const { EditableField } = await import("./EditableField");
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <EditableField
          value="Initial"
          onChange={onChangeMock}
          editable
          testID="f4"
        />,
      );
    });
    act(() => {
      findHost(renderer, "f4").props.onPress();
    });
    act(() => {
      findHost(renderer, "f4-input").props.onChangeText("Updated");
    });
    act(() => {
      findHost(renderer, "f4-save").props.onPress();
    });
    expect(onChangeMock).toHaveBeenCalledWith("Updated");
    // Back to display mode
    expect(() => findHost(renderer, "f4-input")).toThrow();
  });

  it("blur on input also commits onChange(draft)", async () => {
    const { EditableField } = await import("./EditableField");
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <EditableField
          value="A"
          onChange={onChangeMock}
          editable
          testID="f5"
        />,
      );
    });
    act(() => findHost(renderer, "f5").props.onPress());
    act(() => findHost(renderer, "f5-input").props.onChangeText("B"));
    act(() => findHost(renderer, "f5-input").props.onBlur());
    expect(onChangeMock).toHaveBeenCalledWith("B");
  });

  it("numeric mode passes keyboardType=number-pad", async () => {
    const { EditableField } = await import("./EditableField");
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <EditableField
          value="12"
          onChange={onChangeMock}
          editable
          numeric
          testID="f6"
        />,
      );
    });
    act(() => findHost(renderer, "f6").props.onPress());
    const input = findHost(renderer, "f6-input");
    expect(input.props.keyboardType).toBe("number-pad");
  });

  it("long-press also enters edit mode", async () => {
    const { EditableField } = await import("./EditableField");
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <EditableField
          value="X"
          onChange={onChangeMock}
          editable
          testID="f7"
        />,
      );
    });
    act(() => findHost(renderer, "f7").props.onLongPress());
    expect(findHost(renderer, "f7-input").props.value).toBe("X");
  });

  it("textClassName overrides the default text class on display Text", async () => {
    const { EditableField } = await import("./EditableField");
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <EditableField
          value="Z"
          onChange={onChangeMock}
          textClassName="text-xs text-muted-foreground"
          testID="f8"
        />,
      );
    });
    const text = findHost(renderer, "f8");
    expect(text.props.className).toBe("text-xs text-muted-foreground");
  });
});
