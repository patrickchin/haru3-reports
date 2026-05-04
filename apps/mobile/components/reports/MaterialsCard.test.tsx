import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TestRenderer, { act } from "react-test-renderer";

const onChangeMock = vi.fn();

vi.mock("lucide-react-native", () => ({
  Package: () => React.createElement("PackageIcon"),
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
    findHost(renderer, "materials-edit").props.onPress();
  });
}

const sampleMaterial = {
  name: "Cement",
  quantity: "10",
  quantityUnit: "bags",
  status: "delivered",
  condition: "good",
  notes: "Stored in shed",
};

describe("MaterialsCard", () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    onChangeMock.mockClear();
  });

  afterEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = false;
  });

  it("renders read-only by default and shows material details", async () => {
    const { MaterialsCard } = await import("./MaterialsCard");
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<MaterialsCard materials={[sampleMaterial]} />);
    });
    const json = JSON.stringify(renderer.toJSON());
    expect(json).toContain("Cement");
    expect(json).toContain("Stored in shed");
    expect(json).not.toContain("PlusIcon");
    expect(json).not.toContain("TrashIcon");
    expect(json).not.toContain("PencilIcon");
  });

  it("returns null when not editable and materials list is empty", async () => {
    const { MaterialsCard } = await import("./MaterialsCard");
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<MaterialsCard materials={[]} />);
    });
    expect(renderer.toJSON()).toBeNull();
  });

  it("editable mode shows pencil and read-only display by default", async () => {
    const { MaterialsCard } = await import("./MaterialsCard");
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <MaterialsCard
          materials={[sampleMaterial]}
          editable
          onChange={onChangeMock}
        />,
      );
    });
    expect(() => findHost(renderer, "materials-edit")).not.toThrow();
    expect(() => findHost(renderer, "materials-add")).toThrow();
    expect(() => findHost(renderer, "materials-0-trash")).toThrow();
  });

  it("tapping pencil enters edit mode and reveals inputs + add + trash", async () => {
    const { MaterialsCard } = await import("./MaterialsCard");
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <MaterialsCard
          materials={[sampleMaterial]}
          editable
          onChange={onChangeMock}
        />,
      );
    });
    enterEdit(renderer);
    expect(() => findHost(renderer, "materials-add")).not.toThrow();
    expect(() => findHost(renderer, "materials-0-trash")).not.toThrow();
    expect(() => findHost(renderer, "materials-0-name-input")).not.toThrow();
    expect(() => findHost(renderer, "materials-0-quantity-input")).not.toThrow();
    expect(() => findHost(renderer, "materials-0-notes-input")).not.toThrow();
    expect(() => findHost(renderer, "materials-save")).not.toThrow();
    expect(() => findHost(renderer, "materials-cancel")).not.toThrow();
  });

  it("editing the name + save calls onChange with the whole patched array", async () => {
    const { MaterialsCard } = await import("./MaterialsCard");
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <MaterialsCard
          materials={[sampleMaterial]}
          editable
          onChange={onChangeMock}
        />,
      );
    });
    enterEdit(renderer);
    act(() => {
      findHost(renderer, "materials-0-name-input").props.onChangeText("Sand");
    });
    act(() => {
      findHost(renderer, "materials-save").props.onPress();
    });
    expect(onChangeMock).toHaveBeenCalledTimes(1);
    const arg = onChangeMock.mock.calls[0]![0];
    expect(arg).toHaveLength(1);
    expect(arg[0]).toEqual({ ...sampleMaterial, name: "Sand" });
  });

  it("Add material button appends blankMaterial() and save commits", async () => {
    const { MaterialsCard } = await import("./MaterialsCard");
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <MaterialsCard
          materials={[sampleMaterial]}
          editable
          onChange={onChangeMock}
        />,
      );
    });
    enterEdit(renderer);
    act(() => {
      findHost(renderer, "materials-add").props.onPress();
    });
    expect(onChangeMock).not.toHaveBeenCalled();
    act(() => {
      findHost(renderer, "materials-save").props.onPress();
    });
    const arg = onChangeMock.mock.calls[0]![0];
    expect(arg).toHaveLength(2);
    expect(arg[1]).toEqual({
      name: "",
      quantity: null,
      quantityUnit: null,
      condition: null,
      status: null,
      notes: null,
    });
  });

  it("trash button removes the row from draft and save commits", async () => {
    const { MaterialsCard } = await import("./MaterialsCard");
    const second = { ...sampleMaterial, name: "Sand" };
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <MaterialsCard
          materials={[sampleMaterial, second]}
          editable
          onChange={onChangeMock}
        />,
      );
    });
    enterEdit(renderer);
    act(() => {
      findHost(renderer, "materials-0-trash").props.onPress();
    });
    act(() => {
      findHost(renderer, "materials-save").props.onPress();
    });
    expect(onChangeMock).toHaveBeenCalledWith([second]);
  });

  it("cancel reverts draft and exits edit without calling onChange", async () => {
    const { MaterialsCard } = await import("./MaterialsCard");
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <MaterialsCard
          materials={[sampleMaterial]}
          editable
          onChange={onChangeMock}
        />,
      );
    });
    enterEdit(renderer);
    act(() => {
      findHost(renderer, "materials-0-name-input").props.onChangeText("Sand");
    });
    act(() => {
      findHost(renderer, "materials-cancel").props.onPress();
    });
    expect(onChangeMock).not.toHaveBeenCalled();
    expect(() => findHost(renderer, "materials-0-name-input")).toThrow();
  });

  it("renders Add button when empty and editable=true (after entering edit mode)", async () => {
    const { MaterialsCard } = await import("./MaterialsCard");
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <MaterialsCard materials={[]} editable onChange={onChangeMock} />,
      );
    });
    expect(renderer.toJSON()).not.toBeNull();
    enterEdit(renderer);
    act(() => {
      findHost(renderer, "materials-add").props.onPress();
    });
    act(() => {
      findHost(renderer, "materials-save").props.onPress();
    });
    const arg = onChangeMock.mock.calls[0]![0];
    expect(arg).toHaveLength(1);
    expect(arg[0].name).toBe("");
  });
});
