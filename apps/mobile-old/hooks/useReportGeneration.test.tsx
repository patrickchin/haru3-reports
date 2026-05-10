import React, { forwardRef, useImperativeHandle } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TestRenderer, { act } from "react-test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useReportGeneration } from "./useReportGeneration";
import type { GeneratedSiteReport } from "@/lib/generated-report";

const invokeMock = vi.fn();
const getStoredProviderMock = vi.fn();
const getStoredModelMock = vi.fn();

vi.mock("@/lib/backend", () => ({
  backend: {
    functions: {
      invoke: (...args: unknown[]) => invokeMock(...args),
    },
  },
}));

vi.mock("@/hooks/useAiProvider", () => ({
  getStoredProvider: (...args: unknown[]) => getStoredProviderMock(...args),
  getStoredModel: (...args: unknown[]) => getStoredModelMock(...args),
}));

type HookHandle = ReturnType<typeof useReportGeneration>;

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function makeReport(title: string): GeneratedSiteReport {
  return {
    report: {
      meta: { title, reportType: "daily", summary: "", visitDate: "2026-04-20" },
      weather: null,
      workers: null,
      materials: [],
      issues: [],
      nextSteps: [],
      sections: [],
    },
  };
}

function makeResponse(title: string) {
  return {
    report: makeReport(title).report,
    usage: null,
    provider: "kimi",
    model: "kimi-k2-0711-preview",
    systemPrompt: `SYS_${title}`,
    userPrompt: `USR_${title}`,
  };
}

const HookHarness = forwardRef<HookHandle, { notes: readonly string[] }>(
  ({ notes }, ref) => {
    const value = useReportGeneration(notes, "project-1");
    useImperativeHandle(ref, () => value, [value]);
    return null;
  },
);

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function renderHarness(
  queryClient: QueryClient,
  ref: React.RefObject<HookHandle | null>,
  notes: readonly string[],
) {
  return (
    <QueryClientProvider client={queryClient}>
      <HookHarness ref={ref} notes={notes} />
    </QueryClientProvider>
  );
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

async function flushAndRender(
  renderer: TestRenderer.ReactTestRenderer,
  queryClient: QueryClient,
  ref: React.RefObject<HookHandle | null>,
  notes: readonly string[],
) {
  for (let i = 0; i < 8; i++) {
    await flushPromises();
    act(() => {
      renderer.update(renderHarness(queryClient, ref, notes));
    });
  }
}

describe("useReportGeneration — manual trigger", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getStoredProviderMock.mockResolvedValue("kimi");
    getStoredModelMock.mockResolvedValue("kimi-k2-0711-preview");
  });

  it("does not call the edge function on mount or when notes change", async () => {
    const hookRef = React.createRef<HookHandle>();
    const queryClient = createQueryClient();
    let renderer!: TestRenderer.ReactTestRenderer;

    act(() => {
      renderer = TestRenderer.create(renderHarness(queryClient, hookRef, []));
    });

    await flushPromises();

    act(() => {
      renderer.update(renderHarness(queryClient, hookRef, ["note 1"]));
    });
    act(() => {
      renderer.update(renderHarness(queryClient, hookRef, ["note 1", "note 2"]));
    });

    await flushPromises();

    expect(invokeMock).not.toHaveBeenCalled();
    expect(hookRef.current?.report).toBeNull();
    expect(hookRef.current?.notesSinceLastGeneration).toBe(2);

    act(() => {
      renderer.unmount();
    });
  });

  it("regenerate() invokes the edge function and stores the report + lastGeneration", async () => {
    invokeMock.mockResolvedValueOnce({ data: makeResponse("First"), error: null });

    const hookRef = React.createRef<HookHandle>();
    const queryClient = createQueryClient();
    let renderer!: TestRenderer.ReactTestRenderer;

    act(() => {
      renderer = TestRenderer.create(renderHarness(queryClient, hookRef, ["note 1"]));
    });
    await flushPromises();

    act(() => {
      hookRef.current?.regenerate();
    });
    await flushAndRender(renderer, queryClient, hookRef, ["note 1"]);

    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(invokeMock.mock.calls[0]?.[1]?.body).toMatchObject({
      notes: ["note 1"],
      provider: "kimi",
      model: "kimi-k2-0711-preview",
    });
    expect(hookRef.current?.report?.report.meta.title).toBe("First");
    expect(hookRef.current?.notesSinceLastGeneration).toBe(0);
    expect(hookRef.current?.lastGeneration?.error).toBeNull();
    expect(hookRef.current?.lastGeneration?.systemPrompt).toBe("SYS_First");
    expect(hookRef.current?.lastGeneration?.provider).toBe("kimi");

    act(() => {
      renderer.unmount();
    });
  });

  it("notesSinceLastGeneration grows as notes are added after a successful generation", async () => {
    invokeMock.mockResolvedValueOnce({ data: makeResponse("Done"), error: null });

    const hookRef = React.createRef<HookHandle>();
    const queryClient = createQueryClient();
    let renderer!: TestRenderer.ReactTestRenderer;

    act(() => {
      renderer = TestRenderer.create(renderHarness(queryClient, hookRef, ["a"]));
    });
    await flushPromises();
    act(() => {
      hookRef.current?.regenerate();
    });
    await flushAndRender(renderer, queryClient, hookRef, ["a"]);

    expect(hookRef.current?.notesSinceLastGeneration).toBe(0);

    act(() => {
      renderer.update(renderHarness(queryClient, hookRef, ["a", "b", "c"]));
    });
    await flushPromises();

    expect(hookRef.current?.notesSinceLastGeneration).toBe(2);
    expect(invokeMock).toHaveBeenCalledTimes(1);

    act(() => {
      renderer.unmount();
    });
  });

  it("ignores concurrent regenerate() calls while a request is in flight", async () => {
    const first = createDeferred<{ data: ReturnType<typeof makeResponse>; error: null }>();
    invokeMock.mockImplementationOnce(() => first.promise);

    const hookRef = React.createRef<HookHandle>();
    const queryClient = createQueryClient();
    let renderer!: TestRenderer.ReactTestRenderer;

    act(() => {
      renderer = TestRenderer.create(renderHarness(queryClient, hookRef, ["note"]));
    });
    await flushPromises();

    act(() => {
      hookRef.current?.regenerate();
    });
    // Allow getStoredProvider / getStoredModel to resolve so invokeMock fires.
    await flushAndRender(renderer, queryClient, hookRef, ["note"]);
    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(hookRef.current?.isUpdating).toBe(true);

    // Try several more triggers while pending — they should be ignored.
    act(() => {
      hookRef.current?.regenerate();
      hookRef.current?.regenerate();
    });
    await flushPromises();
    expect(invokeMock).toHaveBeenCalledTimes(1);

    // Resolve the in-flight request.
    first.resolve({ data: makeResponse("Done"), error: null });
    await flushAndRender(renderer, queryClient, hookRef, ["note"]);

    expect(hookRef.current?.isUpdating).toBe(false);
    expect(hookRef.current?.report?.report.meta.title).toBe("Done");

    act(() => {
      renderer.unmount();
    });
  });

  it("regenerate() does nothing when the notes list is empty", async () => {
    const hookRef = React.createRef<HookHandle>();
    const queryClient = createQueryClient();
    let renderer!: TestRenderer.ReactTestRenderer;

    act(() => {
      renderer = TestRenderer.create(renderHarness(queryClient, hookRef, []));
    });
    await flushPromises();

    act(() => {
      hookRef.current?.regenerate();
    });
    await flushPromises();

    expect(invokeMock).not.toHaveBeenCalled();

    act(() => {
      renderer.unmount();
    });
  });
});
