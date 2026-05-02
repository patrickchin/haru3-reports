import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TestRenderer, { act } from "react-test-renderer";

const onChangeMock = vi.fn();

vi.mock("lucide-react-native", () => ({
  ClipboardList: () => React.createElement("ClipboardListIcon"),
  Trash2: () => React.createElement("TrashIcon"),
  Plus: () => React.createElement("PlusIcon"),
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

vi.mock("@/components/ui/Card", () => ({
  Card: ({ children, testID }: { children?: React.ReactNode; testID?: string }) =>
    React.createElement("Card", { testID }, children),
}));

vi.mock("@/components/ui/SectionHeader", () => ({
  SectionHeader: ({ title, subtitle }: { title: string; subtitle?: string }) =>
    React.createElement("SectionHeader", { title, subtitle }),
}));

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

describe("NextStepsCard", () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    onChangeMock.mockClear();
  });

  afterEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = false;
  });

  it("renders read-only by default listing each step", async () => {
    const { NextStepsCard } = await import("./NextStepsCard");
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <NextStepsCard steps={["Order rebar", "Schedule inspection"]} />,
      );
    });
    const json = JSON.stringify(renderer.toJSON());
    expect(json).toContain("Order rebar");
    expect(json).toContain("Schedule inspection");
    expect(json).not.toContain("PlusIcon");
    expect(json).not.toContain("TrashIcon");
    expect(json).not.toContain("next-step-add");
  });

  it("returns null when not editable and steps is empty", async () => {
    const { NextStepsCard } = await import("./NextStepsCard");
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<NextStepsCard steps={[]} />);
    });
    expect(renderer.toJSON()).toBeNull();
  });

  it("renders Add step button and trash buttons when editable", async () => {
    const { NextStepsCard } = await import("./NextStepsCard");
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <NextStepsCard
          steps={["Order rebar"]}
          editable
          onChange={onChangeMock}
        />,
      );
    });
    expect(findHost(renderer, "next-step-add")).toBeDefined();
    expect(findHost(renderer, "next-step-0")).toBeDefined();
    expect(findHost(renderer, "next-step-0-trash")).toBeDefined();
  });

  it("editing a step commits via onChange with the patched array", async () => {
    const { NextStepsCard } = await import("./NextStepsCard");
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <NextStepsCard
          steps={["Order rebar", "Pour slab"]}
          editable
          onChange={onChangeMock}
        />,
      );
    });
    act(() => {
      findHost(renderer, "next-step-0").props.onPress();
    });
    act(() => {
      findHost(renderer, "next-step-0-input").props.onChangeText("Order doubled rebar");
    });
    act(() => {
      findHost(renderer, "next-step-0-save").props.onPress();
    });
    expect(onChangeMock).toHaveBeenCalledWith([
      "Order doubled rebar",
      "Pour slab",
    ]);
  });

  it("Add step button appends an empty string", async () => {
    const { NextStepsCard } = await import("./NextStepsCard");
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <NextStepsCard
          steps={["Order rebar"]}
          editable
          onChange={onChangeMock}
        />,
      );
    });
    act(() => {
      findHost(renderer, "next-step-add").props.onPress();
    });
    expect(onChangeMock).toHaveBeenCalledWith(["Order rebar", ""]);
  });

  it("trash button removes the step", async () => {
    const { NextStepsCard } = await import("./NextStepsCard");
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <NextStepsCard
          steps={["Order rebar", "Pour slab"]}
          editable
          onChange={onChangeMock}
        />,
      );
    });
    act(() => {
      findHost(renderer, "next-step-0-trash").props.onPress();
    });
    expect(onChangeMock).toHaveBeenCalledWith(["Pour slab"]);
  });

  it("renders editable shell with Add step when empty and editable=true", async () => {
    const { NextStepsCard } = await import("./NextStepsCard");
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <NextStepsCard steps={[]} editable onChange={onChangeMock} />,
      );
    });
    expect(renderer.toJSON()).not.toBeNull();
    act(() => {
      findHost(renderer, "next-step-add").props.onPress();
    });
    expect(onChangeMock).toHaveBeenCalledWith([""]);
  });
});
