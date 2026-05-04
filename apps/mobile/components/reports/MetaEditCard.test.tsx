import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TestRenderer, { act } from "react-test-renderer";

const onChangeMock = vi.fn();

vi.mock("lucide-react-native", () => ({
  FileText: () => React.createElement("FileTextIcon"),
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
  SectionHeader: ({ title, icon }: any) =>
    React.createElement("SectionHeader", { title }, icon),
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

const baseMeta = {
  title: "Weekly site visit",
  reportType: "site_visit",
  summary: "Steady progress on foundations.",
  visitDate: "2026-05-01",
};

describe("MetaEditCard", () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    onChangeMock.mockClear();
  });
  afterEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = false;
  });

  it("returns null when not editable", async () => {
    const { MetaEditCard } = await import("./MetaEditCard");
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<MetaEditCard meta={baseMeta} />);
    });
    expect(renderer.toJSON()).toBeNull();
  });

  it("renders fields for title, summary, reportType, visitDate when editable", async () => {
    const { MetaEditCard } = await import("./MetaEditCard");
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <MetaEditCard meta={baseMeta} editable onChange={onChangeMock} />,
      );
    });
    expect(() => findHost(renderer, "meta-title")).not.toThrow();
    expect(() => findHost(renderer, "meta-summary")).not.toThrow();
    expect(() => findHost(renderer, "meta-report-type")).not.toThrow();
    expect(() => findHost(renderer, "meta-visit-date")).not.toThrow();
    expect(() => findHost(renderer, "meta-edit")).not.toThrow();
    const json = JSON.stringify(renderer.toJSON());
    expect(json).not.toContain("TextInput");
  });

  it("editing title calls onChange with full meta patch", async () => {
    const { MetaEditCard } = await import("./MetaEditCard");
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <MetaEditCard meta={baseMeta} editable onChange={onChangeMock} />,
      );
    });
    act(() => findHost(renderer, "meta-edit").props.onPress());
    act(() =>
      findHost(renderer, "meta-title-input").props.onChangeText("New title"),
    );
    act(() => findHost(renderer, "meta-save").props.onPress());
    expect(onChangeMock).toHaveBeenCalledWith({
      title: "New title",
      summary: baseMeta.summary,
      reportType: baseMeta.reportType,
      visitDate: baseMeta.visitDate,
    });
  });

  it("editing summary uses a multiline TextInput and commits patch", async () => {
    const { MetaEditCard } = await import("./MetaEditCard");
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <MetaEditCard meta={baseMeta} editable onChange={onChangeMock} />,
      );
    });
    act(() => findHost(renderer, "meta-edit").props.onPress());
    const input = findHost(renderer, "meta-summary-input");
    expect(input.props.multiline).toBe(true);
    act(() => input.props.onChangeText("Updated summary"));
    act(() => findHost(renderer, "meta-save").props.onPress());
    expect(onChangeMock).toHaveBeenCalledWith({
      title: baseMeta.title,
      summary: "Updated summary",
      reportType: baseMeta.reportType,
      visitDate: baseMeta.visitDate,
    });
  });

  it("clearing visitDate to empty passes null in patch", async () => {
    const { MetaEditCard } = await import("./MetaEditCard");
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <MetaEditCard meta={baseMeta} editable onChange={onChangeMock} />,
      );
    });
    act(() => findHost(renderer, "meta-edit").props.onPress());
    act(() =>
      findHost(renderer, "meta-visit-date-input").props.onChangeText(""),
    );
    act(() => findHost(renderer, "meta-save").props.onPress());
    expect(onChangeMock).toHaveBeenCalledWith({
      title: baseMeta.title,
      summary: baseMeta.summary,
      reportType: baseMeta.reportType,
      visitDate: null,
    });
  });

  it("blanking reportType falls back to site_visit", async () => {
    const { MetaEditCard } = await import("./MetaEditCard");
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <MetaEditCard meta={baseMeta} editable onChange={onChangeMock} />,
      );
    });
    act(() => findHost(renderer, "meta-edit").props.onPress());
    act(() =>
      findHost(renderer, "meta-report-type-input").props.onChangeText(""),
    );
    act(() => findHost(renderer, "meta-save").props.onPress());
    expect(onChangeMock).toHaveBeenCalledWith({
      title: baseMeta.title,
      summary: baseMeta.summary,
      reportType: "site_visit",
      visitDate: baseMeta.visitDate,
    });
  });

  it("cancel reverts draft and does not call onChange", async () => {
    const { MetaEditCard } = await import("./MetaEditCard");
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <MetaEditCard meta={baseMeta} editable onChange={onChangeMock} />,
      );
    });
    act(() => findHost(renderer, "meta-edit").props.onPress());
    act(() =>
      findHost(renderer, "meta-title-input").props.onChangeText("Discarded"),
    );
    act(() => findHost(renderer, "meta-cancel").props.onPress());
    expect(onChangeMock).not.toHaveBeenCalled();
    expect(() => findHost(renderer, "meta-title-input")).toThrow();
    const json = JSON.stringify(renderer.toJSON());
    expect(json).toContain(baseMeta.title);
    expect(json).not.toContain("Discarded");
  });
});
