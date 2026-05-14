import React, { forwardRef, useImperativeHandle } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TestRenderer, { act } from "react-test-renderer";

import type { GeneratedSiteReport } from "@/lib/generated-report";

import { useReportAutoSave } from "./useReportAutoSave";

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

// --- module-scoped mocks ---------------------------------------------------

const mutateAsyncMock = vi.fn<(...args: unknown[]) => Promise<void>>();

let appStateListener: ((state: string) => void) | null = null;
const appStateRemoveMock = vi.fn();

vi.mock("react-native", () => ({
  AppState: {
    addEventListener: (_event: string, cb: (state: string) => void) => {
      appStateListener = cb;
      return { remove: appStateRemoveMock };
    },
  },
}));

vi.mock("./useLocalReports", () => ({
  useLocalReportMutations: () => ({
    create: { mutate: vi.fn(), isPending: false },
    update: { mutateAsync: mutateAsyncMock, isPending: false },
    remove: { mutate: vi.fn(), isPending: false },
  }),
}));

// --- helpers ---------------------------------------------------------------

function makeReport(summary = "hello"): GeneratedSiteReport {
  return {
    report: {
      meta: {
        title: "T",
        siteName: null,
        dateLabel: null,
        summary,
        confidenceScore: null,
        confidenceLabel: null,
        confidenceReasoning: null,
      },
      weather: null,
      workers: null,
      materials: [],
      issues: [],
      nextSteps: [],
      sections: [],
    },
  } as unknown as GeneratedSiteReport;
}

type HookArgs = {
  reportId: string | null;
  projectId: string;
  report: GeneratedSiteReport | null;
  debounceMs?: number;
};

type HookHandle = {
  flush: () => Promise<void>;
  markSaved: (s: GeneratedSiteReport) => void;
  isSaving: boolean;
  lastSavedAt: number | null;
};

const Probe = forwardRef<HookHandle, HookArgs>(function Probe(props, ref) {
  const value = useReportAutoSave(props);
  useImperativeHandle(ref, () => value, [value]);
  return null;
});

function render(initial: HookArgs) {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const ref = React.createRef<HookHandle>();
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<Probe ref={ref} {...initial} />);
  });
  return {
    get current(): HookHandle {
      if (!ref.current) throw new Error("hook not mounted");
      return ref.current;
    },
    rerender(next: HookArgs) {
      act(() => {
        renderer.update(<Probe ref={ref} {...next} />);
      });
    },
    unmount() {
      act(() => {
        renderer.unmount();
      });
    },
  };
}

// --- tests -----------------------------------------------------------------

describe("useReportAutoSave", () => {
  beforeEach(() => {
    mutateAsyncMock.mockReset();
    mutateAsyncMock.mockResolvedValue(undefined);
    appStateRemoveMock.mockReset();
    appStateListener = null;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.IS_REACT_ACT_ENVIRONMENT = false;
  });

  it("debounces rapid changes into a single mutation call", async () => {
    const r1 = makeReport("v1");
    const r2 = makeReport("v2");
    const r3 = makeReport("v3");
    const hook = render({ reportId: "rep-1", projectId: "proj-1", report: r1 });

    hook.rerender({ reportId: "rep-1", projectId: "proj-1", report: r2 });
    hook.rerender({ reportId: "rep-1", projectId: "proj-1", report: r3 });

    expect(mutateAsyncMock).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1500);
      await Promise.resolve();
    });

    expect(mutateAsyncMock).toHaveBeenCalledTimes(1);
    const arg = mutateAsyncMock.mock.calls[0][0] as {
      id: string;
      projectId: string;
      fields: { report_data: unknown };
    };
    expect(arg.id).toBe("rep-1");
    expect(arg.projectId).toBe("proj-1");
    expect(arg.fields.report_data).toEqual(r3);

    hook.unmount();
  });

  it("markSaved prevents an initial write when the value matches", async () => {
    const r1 = makeReport("hydrated");
    const hook = render({ reportId: "rep-1", projectId: "p", report: null });
    act(() => {
      hook.current.markSaved(r1);
    });
    hook.rerender({ reportId: "rep-1", projectId: "p", report: r1 });

    await act(async () => {
      vi.advanceTimersByTime(2000);
      await Promise.resolve();
    });

    expect(mutateAsyncMock).not.toHaveBeenCalled();
    hook.unmount();
  });

  it("flush() triggers an immediate write and awaits it", async () => {
    const r1 = makeReport("v1");
    const hook = render({ reportId: "rep-1", projectId: "p", report: r1 });

    expect(mutateAsyncMock).not.toHaveBeenCalled();
    await act(async () => {
      await hook.current.flush();
    });
    expect(mutateAsyncMock).toHaveBeenCalledTimes(1);
    expect(hook.current.lastSavedAt).not.toBeNull();
    hook.unmount();
  });

  it("flushes on AppState transition away from active", async () => {
    const r1 = makeReport("v1");
    const hook = render({ reportId: "rep-1", projectId: "p", report: r1 });

    expect(appStateListener).toBeTypeOf("function");

    await act(async () => {
      appStateListener!("background");
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mutateAsyncMock).toHaveBeenCalledTimes(1);
    hook.unmount();
  });

  it("does not write when reportId is null", async () => {
    const r1 = makeReport("v1");
    const hook = render({ reportId: null, projectId: "p", report: r1 });

    await act(async () => {
      vi.advanceTimersByTime(5000);
      await Promise.resolve();
    });
    expect(mutateAsyncMock).not.toHaveBeenCalled();

    await act(async () => {
      await hook.current.flush();
    });
    expect(mutateAsyncMock).not.toHaveBeenCalled();

    hook.unmount();
  });

  it("cancels the pending debounce timer on unmount", async () => {
    const r1 = makeReport("v1");
    const hook = render({ reportId: "rep-1", projectId: "p", report: r1 });

    hook.unmount();

    await act(async () => {
      vi.advanceTimersByTime(5000);
      await Promise.resolve();
    });
    expect(mutateAsyncMock).not.toHaveBeenCalled();
  });

  it("collapses identical-value re-renders into zero writes after a save", async () => {
    const r1 = makeReport("v1");
    const hook = render({ reportId: "rep-1", projectId: "p", report: r1 });

    await act(async () => {
      vi.advanceTimersByTime(1500);
      await Promise.resolve();
    });
    expect(mutateAsyncMock).toHaveBeenCalledTimes(1);

    // Re-render with the same content (different object identity).
    hook.rerender({
      reportId: "rep-1",
      projectId: "p",
      report: makeReport("v1"),
    });
    await act(async () => {
      vi.advanceTimersByTime(2000);
      await Promise.resolve();
    });
    expect(mutateAsyncMock).toHaveBeenCalledTimes(1);
    hook.unmount();
  });
});
