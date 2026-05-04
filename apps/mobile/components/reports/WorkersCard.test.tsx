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
    React.createElement(
      "SectionHeader",
      { title, subtitle },
      trailing ?? null,
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

function enterEdit(renderer: TestRenderer.ReactTestRenderer) {
  act(() => {
    findHost(renderer, "workers-edit").props.onPress();
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
    // No edit affordances when not editable
    expect(json).not.toContain("PlusIcon");
    expect(json).not.toContain("TrashIcon");
    expect(json).not.toContain("PencilIcon");
  });

  it("returns null when not editable and workers is null", async () => {
    const { WorkersCard } = await import("./WorkersCard");
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<WorkersCard workers={null} />);
    });
    expect(renderer.toJSON()).toBeNull();
  });

  it("editable mode shows pencil and read-only display by default", async () => {
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
    expect(() => findHost(renderer, "workers-edit")).not.toThrow();
    // No inputs / add / trash visible until edit mode
    expect(() => findHost(renderer, "workers-add-role")).toThrow();
  });

  it("tapping pencil enters edit mode and reveals inputs + add + trash", async () => {
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
    enterEdit(renderer);
    expect(() => findHost(renderer, "workers-add-role")).not.toThrow();
    expect(() => findHost(renderer, "workers-role-0-trash")).not.toThrow();
    expect(() => findHost(renderer, "workers-role-0-name-input")).not.toThrow();
    expect(() => findHost(renderer, "workers-role-0-count-input")).not.toThrow();
    expect(() => findHost(renderer, "workers-total-input")).not.toThrow();
    expect(() => findHost(renderer, "workers-hours-input")).not.toThrow();
    expect(() => findHost(renderer, "workers-notes-input")).not.toThrow();
    expect(() => findHost(renderer, "workers-save")).not.toThrow();
    expect(() => findHost(renderer, "workers-cancel")).not.toThrow();
  });

  it("editing a role name + save calls onChange with the patched roles array", async () => {
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
    enterEdit(renderer);
    act(() => {
      findHost(renderer, "workers-role-0-name-input").props.onChangeText("Foreman");
    });
    act(() => {
      findHost(renderer, "workers-save").props.onPress();
    });
    expect(onChangeMock).toHaveBeenCalledTimes(1);
    const arg = onChangeMock.mock.calls[0]![0];
    expect(arg.roles).toEqual([{ role: "Foreman", count: 3, notes: null }]);
  });

  it("Add role button appends blankRole() to draft and save commits it", async () => {
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
    enterEdit(renderer);
    act(() => {
      findHost(renderer, "workers-add-role").props.onPress();
    });
    // onChange not called yet — only on save
    expect(onChangeMock).not.toHaveBeenCalled();
    act(() => {
      findHost(renderer, "workers-save").props.onPress();
    });
    expect(onChangeMock).toHaveBeenCalledTimes(1);
    const arg = onChangeMock.mock.calls[0]![0];
    expect(arg.roles).toHaveLength(2);
    expect(arg.roles[0]).toEqual({ role: "Mason", count: 3, notes: null });
    expect(arg.roles[1]).toEqual({ role: "", count: null, notes: null });
  });

  it("trash button removes the row from draft and save commits", async () => {
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
    enterEdit(renderer);
    act(() => {
      findHost(renderer, "workers-role-0-trash").props.onPress();
    });
    act(() => {
      findHost(renderer, "workers-save").props.onPress();
    });
    expect(onChangeMock).toHaveBeenCalledTimes(1);
    const arg = onChangeMock.mock.calls[0]![0];
    expect(arg.roles).toEqual([{ role: "Carpenter", count: 1, notes: null }]);
  });

  it("cancel reverts the draft and exits edit without calling onChange", async () => {
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
    enterEdit(renderer);
    act(() => {
      findHost(renderer, "workers-role-0-name-input").props.onChangeText("XXX");
    });
    act(() => {
      findHost(renderer, "workers-cancel").props.onPress();
    });
    expect(onChangeMock).not.toHaveBeenCalled();
    // Back to read-only: no inputs
    expect(() => findHost(renderer, "workers-role-0-name-input")).toThrow();
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
    expect(() => findHost(renderer, "workers-edit")).not.toThrow();
    enterEdit(renderer);
    act(() => {
      findHost(renderer, "workers-add-role").props.onPress();
    });
    act(() => {
      findHost(renderer, "workers-save").props.onPress();
    });
    const arg = onChangeMock.mock.calls[0]![0];
    expect(arg.roles).toEqual([{ role: "", count: null, notes: null }]);
  });
});
