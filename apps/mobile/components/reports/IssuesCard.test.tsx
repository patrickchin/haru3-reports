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

function enterEdit(renderer: TestRenderer.ReactTestRenderer) {
  act(() => {
    findHost(renderer, "issues-edit").props.onPress();
  });
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
    expect(json).not.toContain("PencilIcon");
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

  it("editable mode shows pencil and read-only display by default", async () => {
    const { IssuesCard } = await import("./IssuesCard");
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <IssuesCard issues={[makeIssue()]} editable onChange={onChangeMock} />,
      );
    });
    expect(() => findHost(renderer, "issues-edit")).not.toThrow();
    // No add / trash / inputs visible until edit mode
    expect(() => findHost(renderer, "issues-add")).toThrow();
    expect(() => findHost(renderer, "issues-0-trash")).toThrow();
    expect(() => findHost(renderer, "issues-0-title-input")).toThrow();
  });

  it("tapping pencil enters edit mode and reveals inputs + add + trash", async () => {
    const { IssuesCard } = await import("./IssuesCard");
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <IssuesCard issues={[makeIssue()]} editable onChange={onChangeMock} />,
      );
    });
    enterEdit(renderer);
    expect(() => findHost(renderer, "issues-add")).not.toThrow();
    expect(() => findHost(renderer, "issues-0-trash")).not.toThrow();
    expect(() => findHost(renderer, "issues-0-title-input")).not.toThrow();
    expect(() => findHost(renderer, "issues-0-category-input")).not.toThrow();
    expect(() => findHost(renderer, "issues-0-severity-input")).not.toThrow();
    expect(() => findHost(renderer, "issues-0-status-input")).not.toThrow();
    expect(() => findHost(renderer, "issues-0-details-input")).not.toThrow();
    expect(() => findHost(renderer, "issues-0-actionRequired-input")).not.toThrow();
    expect(() => findHost(renderer, "issues-save")).not.toThrow();
    expect(() => findHost(renderer, "issues-cancel")).not.toThrow();
  });

  it("editing the title and saving commits via onChange with full patched array", async () => {
    const { IssuesCard } = await import("./IssuesCard");
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <IssuesCard issues={[makeIssue()]} editable onChange={onChangeMock} />,
      );
    });
    enterEdit(renderer);
    act(() => {
      findHost(renderer, "issues-0-title-input").props.onChangeText("New title");
    });
    // Not committed until save
    expect(onChangeMock).not.toHaveBeenCalled();
    act(() => {
      findHost(renderer, "issues-save").props.onPress();
    });
    expect(onChangeMock).toHaveBeenCalledTimes(1);
    const arg = onChangeMock.mock.calls[0]![0];
    expect(arg).toHaveLength(1);
    expect(arg[0].title).toBe("New title");
    expect(arg[0].details).toBe("Visible crack along main beam");
  });

  it("Add issue appends blankIssue() to draft and save commits it", async () => {
    const { IssuesCard } = await import("./IssuesCard");
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <IssuesCard issues={[makeIssue()]} editable onChange={onChangeMock} />,
      );
    });
    enterEdit(renderer);
    act(() => {
      findHost(renderer, "issues-add").props.onPress();
    });
    expect(onChangeMock).not.toHaveBeenCalled();
    act(() => {
      findHost(renderer, "issues-save").props.onPress();
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

  it("trash button removes the row from draft and save commits", async () => {
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
    enterEdit(renderer);
    act(() => {
      findHost(renderer, "issues-0-trash").props.onPress();
    });
    act(() => {
      findHost(renderer, "issues-save").props.onPress();
    });
    expect(onChangeMock).toHaveBeenCalledTimes(1);
    const arg = onChangeMock.mock.calls[0]![0];
    expect(arg).toHaveLength(1);
    expect(arg[0].title).toBe("Second");
  });

  it("cancel reverts the draft and exits edit without calling onChange", async () => {
    const { IssuesCard } = await import("./IssuesCard");
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <IssuesCard issues={[makeIssue()]} editable onChange={onChangeMock} />,
      );
    });
    enterEdit(renderer);
    act(() => {
      findHost(renderer, "issues-0-title-input").props.onChangeText("XXX");
    });
    act(() => {
      findHost(renderer, "issues-cancel").props.onPress();
    });
    expect(onChangeMock).not.toHaveBeenCalled();
    // Back to read-only
    expect(() => findHost(renderer, "issues-0-title-input")).toThrow();
  });

  it("renders editable shell when issues is empty and editable=true", async () => {
    const { IssuesCard } = await import("./IssuesCard");
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <IssuesCard issues={[]} editable onChange={onChangeMock} />,
      );
    });
    expect(renderer.toJSON()).not.toBeNull();
    expect(() => findHost(renderer, "issues-edit")).not.toThrow();
    enterEdit(renderer);
    act(() => {
      findHost(renderer, "issues-add").props.onPress();
    });
    act(() => {
      findHost(renderer, "issues-save").props.onPress();
    });
    expect(onChangeMock).toHaveBeenCalledTimes(1);
    expect(onChangeMock.mock.calls[0]![0]).toHaveLength(1);
  });
});
