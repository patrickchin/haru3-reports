import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TestRenderer, { act } from "react-test-renderer";

const onChangeMock = vi.fn();
const onRemoveMock = vi.fn();

vi.mock("lucide-react-native", () => ({
  ClipboardList: () => React.createElement("ClipboardListIcon"),
  Trash2: () => React.createElement("Trash2Icon"),
  Pencil: () => React.createElement("PencilIcon"),
  Check: () => React.createElement("CheckIcon"),
  Cloud: () => React.createElement("CloudIcon"),
  Users: () => React.createElement("UsersIcon"),
  TrendingUp: () => React.createElement("TrendingUpIcon"),
  AlertTriangle: () => React.createElement("AlertTriangleIcon"),
  Eye: () => React.createElement("EyeIcon"),
  HardHat: () => React.createElement("HardHatIcon"),
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
  Card: ({ children, ...props }: { children?: React.ReactNode }) =>
    React.createElement("Card", props, children ?? null),
}));

vi.mock("@/components/ui/SectionHeader", () => ({
  SectionHeader: ({ title, icon, trailing }: any) =>
    React.createElement(
      "SectionHeader",
      { title: typeof title === "string" ? title : undefined },
      icon,
      trailing,
    ),
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

const baseSection = {
  title: "Progress",
  content: "Foundations poured",
  sourceNoteIndexes: [],
};

describe("SummarySectionCard", () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    onChangeMock.mockClear();
    onRemoveMock.mockClear();
  });
  afterEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = false;
  });

  it("renders read-only by default with no inputs", async () => {
    const { SummarySectionCard } = await import("./SummarySectionCard");
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <SummarySectionCard section={baseSection} index={0} />,
      );
    });
    const json = JSON.stringify(renderer.toJSON());
    expect(json).toContain("Foundations poured");
    expect(json).not.toContain("TextInput");
    expect(json).not.toContain("Trash2Icon");
  });

  it("renders an EditableField for content when editable", async () => {
    const { SummarySectionCard } = await import("./SummarySectionCard");
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <SummarySectionCard
          section={baseSection}
          index={2}
          editable
          onChange={onChangeMock}
          onRemove={onRemoveMock}
        />,
      );
    });
    // Editable display is a Pressable with the testID
    expect(() => findHost(renderer, "section-2-title")).not.toThrow();
    expect(() => findHost(renderer, "section-2-content")).not.toThrow();
    expect(() => findHost(renderer, "section-2-trash")).not.toThrow();
  });

  it("editing the content calls onChange with updated section", async () => {
    const { SummarySectionCard } = await import("./SummarySectionCard");
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <SummarySectionCard
          section={baseSection}
          index={1}
          editable
          onChange={onChangeMock}
        />,
      );
    });
    act(() => findHost(renderer, "section-1-content").props.onPress());
    act(() =>
      findHost(renderer, "section-1-content-input").props.onChangeText("Updated"),
    );
    act(() => findHost(renderer, "section-1-content-save").props.onPress());
    expect(onChangeMock).toHaveBeenCalledWith({
      ...baseSection,
      content: "Updated",
    });
  });

  it("editing the title calls onChange with updated title", async () => {
    const { SummarySectionCard } = await import("./SummarySectionCard");
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <SummarySectionCard
          section={baseSection}
          index={0}
          editable
          onChange={onChangeMock}
        />,
      );
    });
    act(() => findHost(renderer, "section-0-title").props.onPress());
    act(() =>
      findHost(renderer, "section-0-title-input").props.onChangeText("Site Notes"),
    );
    act(() => findHost(renderer, "section-0-title-save").props.onPress());
    expect(onChangeMock).toHaveBeenCalledWith({
      ...baseSection,
      title: "Site Notes",
    });
  });

  it("trash button calls onRemove", async () => {
    const { SummarySectionCard } = await import("./SummarySectionCard");
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <SummarySectionCard
          section={baseSection}
          index={4}
          editable
          onChange={onChangeMock}
          onRemove={onRemoveMock}
        />,
      );
    });
    act(() => findHost(renderer, "section-4-trash").props.onPress());
    expect(onRemoveMock).toHaveBeenCalledTimes(1);
  });
});
