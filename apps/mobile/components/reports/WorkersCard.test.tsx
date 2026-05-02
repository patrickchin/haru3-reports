import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TestRenderer, { act } from "react-test-renderer";

const onChangeMock = vi.fn();

vi.mock("lucide-react-native", () => ({
  Users: () => React.createElement("UsersIcon"),
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

function enterEdit(renderer: TestRenderer.ReactTestRenderer, testID: string) {
  act(() => {
    findHost(renderer, testID).props.onPress();
  });
}

describe("WorkersCard", () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    onChangeMock.mockClear();
  });

  afterEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = false;
  });

  it("renders read-only by default with totals, role rows, hours, notes", async () => {
    const { WorkersCard } = await import("./WorkersCard");
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <WorkersCard
          workers={{
            totalWorkers: 5,
            workerHours: "08:00–17:00",
            notes: "All present",
            roles: [{ role: "Mason", count: 3, notes: null }],
          }}
        />,
      );
    });
    const json = JSON.stringify(renderer.toJSON());
    expect(json).toContain("Mason");
    expect(json).toContain("08:00");
    expect(json).toContain("All present");
    // No edit affordances
    expect(json).not.toContain("PlusIcon");
    expect(json).not.toContain("TrashIcon");
    expect(json).not.toContain("workers-add-role");
  });

  it("returns null when not editable and workers is null", async () => {
    const { WorkersCard } = await import("./WorkersCard");
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<WorkersCard workers={null} />);
    });
    expect(renderer.toJSON()).toBeNull();
  });

  it("renders Add role button and editable inputs when editable", async () => {
    const { WorkersCard } = await import("./WorkersCard");
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <WorkersCard
          workers={{
            totalWorkers: 2,
            workerHours: null,
            notes: null,
            roles: [{ role: "Carpenter", count: 2, notes: null }],
          }}
          editable
          onChange={onChangeMock}
        />,
      );
    });
    expect(findHost(renderer, "workers-add-role")).toBeDefined();
    expect(findHost(renderer, "workers-role-0-trash")).toBeDefined();
    expect(findHost(renderer, "workers-role-0-name")).toBeDefined();
  });

  it("editing a role name calls onChange with the patched roles array", async () => {
    const { WorkersCard } = await import("./WorkersCard");
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <WorkersCard
          workers={{
            totalWorkers: null,
            workerHours: null,
            notes: null,
            roles: [{ role: "Mason", count: 3, notes: null }],
          }}
          editable
          onChange={onChangeMock}
        />,
      );
    });
    enterEdit(renderer, "workers-role-0-name");
    act(() => {
      findHost(renderer, "workers-role-0-name-input").props.onChangeText("Foreman");
    });
    act(() => {
      findHost(renderer, "workers-role-0-name-save").props.onPress();
    });
    expect(onChangeMock).toHaveBeenCalledWith({
      roles: [{ role: "Foreman", count: 3, notes: null }],
    });
  });

  it("Add role button appends blankRole() via onChange", async () => {
    const { WorkersCard } = await import("./WorkersCard");
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <WorkersCard
          workers={{
            totalWorkers: null,
            workerHours: null,
            notes: null,
            roles: [{ role: "Mason", count: 3, notes: null }],
          }}
          editable
          onChange={onChangeMock}
        />,
      );
    });
    act(() => {
      findHost(renderer, "workers-add-role").props.onPress();
    });
    expect(onChangeMock).toHaveBeenCalledTimes(1);
    const arg = onChangeMock.mock.calls[0]![0];
    expect(arg.roles).toHaveLength(2);
    expect(arg.roles[0]).toEqual({ role: "Mason", count: 3, notes: null });
    expect(arg.roles[1]).toEqual({ role: "", count: null, notes: null });
  });

  it("trash button removes the role row via onChange", async () => {
    const { WorkersCard } = await import("./WorkersCard");
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <WorkersCard
          workers={{
            totalWorkers: null,
            workerHours: null,
            notes: null,
            roles: [
              { role: "Mason", count: 3, notes: null },
              { role: "Carpenter", count: 1, notes: null },
            ],
          }}
          editable
          onChange={onChangeMock}
        />,
      );
    });
    act(() => {
      findHost(renderer, "workers-role-0-trash").props.onPress();
    });
    expect(onChangeMock).toHaveBeenCalledWith({
      roles: [{ role: "Carpenter", count: 1, notes: null }],
    });
  });

  it("renders editable shell when workers is null and editable=true", async () => {
    const { WorkersCard } = await import("./WorkersCard");
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <WorkersCard workers={null} editable onChange={onChangeMock} />,
      );
    });
    expect(renderer.toJSON()).not.toBeNull();
    expect(findHost(renderer, "workers-add-role")).toBeDefined();
    act(() => {
      findHost(renderer, "workers-add-role").props.onPress();
    });
    expect(onChangeMock).toHaveBeenCalledWith({
      roles: [{ role: "", count: null, notes: null }],
    });
  });
});
