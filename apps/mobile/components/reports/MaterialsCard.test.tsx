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
    expect(json).not.toContain("materials-add");
  });

  it("returns null when not editable and materials list is empty", async () => {
    const { MaterialsCard } = await import("./MaterialsCard");
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<MaterialsCard materials={[]} />);
    });
    expect(renderer.toJSON()).toBeNull();
  });

  it("renders Add material button and trash + inputs when editable", async () => {
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
    expect(findHost(renderer, "materials-add")).toBeDefined();
    expect(findHost(renderer, "materials-0-trash")).toBeDefined();
    expect(findHost(renderer, "materials-0-name")).toBeDefined();
    expect(findHost(renderer, "materials-0-quantity")).toBeDefined();
    expect(findHost(renderer, "materials-0-notes")).toBeDefined();
  });

  it("editing the name calls onChange with the whole patched array", async () => {
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
    act(() => {
      findHost(renderer, "materials-0-name").props.onPress();
    });
    act(() => {
      findHost(renderer, "materials-0-name-input").props.onChangeText("Sand");
    });
    act(() => {
      findHost(renderer, "materials-0-name-save").props.onPress();
    });
    expect(onChangeMock).toHaveBeenCalledTimes(1);
    const arg = onChangeMock.mock.calls[0]![0];
    expect(arg).toHaveLength(1);
    expect(arg[0]).toEqual({ ...sampleMaterial, name: "Sand" });
  });

  it("Add material button appends blankMaterial() via onChange", async () => {
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
    act(() => {
      findHost(renderer, "materials-add").props.onPress();
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

  it("trash button removes the row via onChange", async () => {
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
    act(() => {
      findHost(renderer, "materials-0-trash").props.onPress();
    });
    expect(onChangeMock).toHaveBeenCalledWith([second]);
  });

  it("renders Add button when empty and editable=true", async () => {
    const { MaterialsCard } = await import("./MaterialsCard");
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <MaterialsCard materials={[]} editable onChange={onChangeMock} />,
      );
    });
    expect(renderer.toJSON()).not.toBeNull();
    act(() => {
      findHost(renderer, "materials-add").props.onPress();
    });
    const arg = onChangeMock.mock.calls[0]![0];
    expect(arg).toHaveLength(1);
    expect(arg[0].name).toBe("");
  });
});
