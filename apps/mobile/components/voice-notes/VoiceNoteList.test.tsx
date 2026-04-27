import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TestRenderer, { act } from "react-test-renderer";

const useProjectFilesMock = vi.fn();

vi.mock("@/hooks/useProjectFiles", () => ({
  useProjectFiles: (...args: unknown[]) => useProjectFilesMock(...args),
}));

vi.mock("./VoiceNoteCard", () => ({
  VoiceNoteCard: () => React.createElement("VoiceNoteCardStub"),
}));

vi.mock("react-native", () => {
  const mk = (name: string) =>
    function Stub(props: { children?: React.ReactNode }) {
      return React.createElement(name, null, props.children ?? null);
    };
  return {
    View: mk("View"),
    Text: mk("Text"),
  };
});

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
});

afterEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
});

describe("VoiceNoteList (regression: surfaces query errors instead of returning null)", () => {
  it("renders an error message when useProjectFiles fails", async () => {
    useProjectFilesMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error("RLS denied"),
    });
    const { VoiceNoteList } = await import("./VoiceNoteList");

    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        React.createElement(VoiceNoteList, { projectId: "p-1" }),
      );
    });

    const json = renderer.toJSON();
    const flatChildren = JSON.stringify(json);
    expect(flatChildren).toContain("Could not load voice notes");
    expect(flatChildren).toContain("RLS denied");
  });

  it("renders nothing when there are no voice notes (no error)", async () => {
    useProjectFilesMock.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    });
    const { VoiceNoteList } = await import("./VoiceNoteList");

    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        React.createElement(VoiceNoteList, { projectId: "p-1" }),
      );
    });

    expect(renderer.toJSON()).toBeNull();
  });

  it("renders a loading hint while fetching", async () => {
    useProjectFilesMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    });
    const { VoiceNoteList } = await import("./VoiceNoteList");

    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        React.createElement(VoiceNoteList, { projectId: "p-1" }),
      );
    });

    expect(JSON.stringify(renderer.toJSON())).toContain("Loading voice notes");
  });
});
