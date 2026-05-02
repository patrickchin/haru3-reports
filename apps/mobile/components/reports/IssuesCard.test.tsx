import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TestRenderer, { act } from "react-test-renderer";

const onChangeMock = vi.fn();

vi.mock("lucide-react-native", () => ({
  AlertTriangle: () => React.createElement("AlertIcon"),
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
  SectionHeader: ({
    title,
    subtitle,
    trailing,
  }: {
    title: string;
    subtitle?: string;
    trailing?: React.ReactNode;
  }) =>
    React.createElement("SectionHeader", { title, subtitle }, trailing ?? null),
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

function makeIssue(overrides: Partial<import("@/lib/generated-report").GeneratedReportIssue> = {}) {
  return {
    title: "Cracked beam",
    category: "structural",
    severity: "high",
    status: "open",
    details: "Visible crack along main beam",
    actionRequired: null,
    sourceNoteIndexes: [] as number[],
    ...overrides,
  };
}

describe("IssuesCard", () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    onChangeMock.mockClear();
  });

  afterEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = false;
  });

  it("renders read-only by default with title, severity, details", async () => {
    const { IssuesCard } = await import("./IssuesCard");
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <IssuesCard issues={[makeIssue({ actionRequired: "Brace immediately" })]} />,
      );
    });
    const json = JSON.stringify(renderer.toJSON());
    expect(json).toContain("Cracked beam");
    expect(json).toContain("Visible crack");
    expect(json).toContain("Brace immediately");
    expect(json).not.toContain("PlusIcon");
    expect(json).not.toContain("TrashIcon");
    expect(json).not.toContain("issues-add");
  });

  it("returns null when not editable and issues is empty", async () => {
    const { IssuesCard } = await import("./IssuesCard");
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<IssuesCard issues={[]} />);
    });
    expect(renderer.toJSON()).toBeNull();
  });

  it("renders Add issue button and editable fields when editable", async () => {
    const { IssuesCard } = await import("./IssuesCard");
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <IssuesCard
          issues={[makeIssue()]}
          editable
          onChange={onChangeMock}
        />,
      );
    });
    expect(findHost(renderer, "issues-add")).toBeDefined();
    expect(findHost(renderer, "issues-0-trash")).toBeDefined();
    expect(findHost(renderer, "issues-0-title")).toBeDefined();
    expect(findHost(renderer, "issues-0-severity")).toBeDefined();
    expect(findHost(renderer, "issues-0-category")).toBeDefined();
    expect(findHost(renderer, "issues-0-description")).toBeDefined();
    expect(findHost(renderer, "issues-0-notes")).toBeDefined();
  });

  it("editing the title commits via onChange with full patched array", async () => {
    const { IssuesCard } = await import("./IssuesCard");
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <IssuesCard
          issues={[makeIssue()]}
          editable
          onChange={onChangeMock}
        />,
      );
    });
    act(() => {
      findHost(renderer, "issues-0-title").props.onPress();
    });
    act(() => {
      findHost(renderer, "issues-0-title-input").props.onChangeText("New title");
    });
    act(() => {
      findHost(renderer, "issues-0-title-save").props.onPress();
    });
    expect(onChangeMock).toHaveBeenCalledTimes(1);
    const arg = onChangeMock.mock.calls[0]![0];
    expect(arg).toHaveLength(1);
    expect(arg[0].title).toBe("New title");
    expect(arg[0].details).toBe("Visible crack along main beam");
  });

  it("Add issue appends blankIssue() to the array", async () => {
    const { IssuesCard } = await import("./IssuesCard");
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <IssuesCard
          issues={[makeIssue()]}
          editable
          onChange={onChangeMock}
        />,
      );
    });
    act(() => {
      findHost(renderer, "issues-add").props.onPress();
    });
    expect(onChangeMock).toHaveBeenCalledTimes(1);
    const arg = onChangeMock.mock.calls[0]![0];
    expect(arg).toHaveLength(2);
    expect(arg[1]).toEqual({
      title: "",
      category: "other",
      severity: "medium",
      status: "open",
      details: "",
      actionRequired: null,
      sourceNoteIndexes: [],
    });
  });

  it("trash button removes the issue row via onChange", async () => {
    const { IssuesCard } = await import("./IssuesCard");
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <IssuesCard
          issues={[
            makeIssue({ title: "First" }),
            makeIssue({ title: "Second" }),
          ]}
          editable
          onChange={onChangeMock}
        />,
      );
    });
    act(() => {
      findHost(renderer, "issues-0-trash").props.onPress();
    });
    expect(onChangeMock).toHaveBeenCalledTimes(1);
    const arg = onChangeMock.mock.calls[0]![0];
    expect(arg).toHaveLength(1);
    expect(arg[0].title).toBe("Second");
  });

  it("renders editable shell with Add issue when issues is empty and editable=true", async () => {
    const { IssuesCard } = await import("./IssuesCard");
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <IssuesCard issues={[]} editable onChange={onChangeMock} />,
      );
    });
    expect(renderer.toJSON()).not.toBeNull();
    act(() => {
      findHost(renderer, "issues-add").props.onPress();
    });
    expect(onChangeMock).toHaveBeenCalledTimes(1);
    expect(onChangeMock.mock.calls[0]![0]).toHaveLength(1);
  });
});
