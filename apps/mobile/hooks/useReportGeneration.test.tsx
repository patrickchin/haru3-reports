import React, { forwardRef, useImperativeHandle } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TestRenderer, { act } from "react-test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useReportGeneration } from "./useReportGeneration";
import type { GeneratedSiteReport } from "@/lib/generated-report";

declare global {
  // React 19 act() requires this flag on globalThis to opt the test
  // environment into act warnings.
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

const invokeMock = vi.fn();
const getStoredProviderMock = vi.fn();

vi.mock("@/lib/backend", () => ({
  backend: {
    functions: {
      invoke: (...args: unknown[]) => invokeMock(...args),
    },
  },
}));

vi.mock("@/hooks/useAiProvider", () => ({
  getStoredProvider: (...args: unknown[]) => getStoredProviderMock(...args),
}));

type HookHandle = ReturnType<typeof useReportGeneration>;

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
};

function createDeferred<T>(): Deferred<T> {
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
      meta: {
        title,
        reportType: "daily",
        summary: "",
        visitDate: "2026-04-20",
      },
      weather: null,
      workers: null,
      materials: [],
      issues: [],
      nextSteps: [],
      sections: [],
    },
  };
}

const HookHarness = forwardRef<HookHandle, { notes: readonly string[] }>(({ notes }, ref) => {
  const value = useReportGeneration(notes, "project-1");
  useImperativeHandle(ref, () => value, [value]);
  return null;
});

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

describe("useReportGeneration", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    getStoredProviderMock.mockResolvedValue("kimi");
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.IS_REACT_ACT_ENVIRONMENT = false;
  });

  it("flushes queued notes even if the active request settles before the queued debounce fires", async () => {
    const firstRequest = createDeferred<{ data: GeneratedSiteReport; error: null }>();

    invokeMock
      .mockImplementationOnce(() => firstRequest.promise)
      .mockResolvedValueOnce({ data: makeReport("Second"), error: null });

    const hookRef = React.createRef<HookHandle>();
    const queryClient = createQueryClient();
    let renderer!: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(renderHarness(queryClient, hookRef, []));
    });

    await act(async () => {
      renderer.update(renderHarness(queryClient, hookRef, ["note 1"]));
      hookRef.current?.bumpNotesVersion();
    });

    await act(async () => {
      vi.advanceTimersByTime(1500);
      await Promise.resolve();
    });

    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(hookRef.current?.isUpdating).toBe(true);

    await act(async () => {
      renderer.update(renderHarness(queryClient, hookRef, ["note 1", "note 2"]));
      hookRef.current?.bumpNotesVersion();
    });

    await act(async () => {
      firstRequest.resolve({ data: makeReport("First"), error: null });
      await Promise.resolve();
    });

    await act(async () => {
      vi.advanceTimersByTime(1500);
      await Promise.resolve();
    });

    expect(invokeMock).toHaveBeenCalledTimes(2);
    expect(invokeMock.mock.calls[1]?.[1]).toMatchObject({
      body: {
        notes: ["note 1", "note 2"],
        lastProcessedNoteCount: 1,
      },
    });

    await act(async () => {
      renderer.unmount();
    });
  });
});
