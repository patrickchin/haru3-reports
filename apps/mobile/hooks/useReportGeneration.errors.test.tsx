/**
 * Error-case tests for useReportGeneration (manual-trigger version).
 *
 * Exercises the failure surfaces the UI must handle:
 *   - Edge function returns an HTTP error (5xx)
 *   - Network call rejects
 *   - Edge function returns a malformed payload (normalizer rejects)
 *   - Recovery: a follow-up regenerate() succeeds after a failure
 *
 * The hook must surface a user-readable error string on `error`, never crash,
 * and always populate `rawResponse` + `lastGeneration` so the Debug tab can
 * show what came back.
 */

import React, { forwardRef, useImperativeHandle } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TestRenderer, { act } from "react-test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useReportGeneration } from "./useReportGeneration";
import { loadFixture } from "@/lib/test-fixtures";

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

async function triggerAndWait(
  renderer: TestRenderer.ReactTestRenderer,
  queryClient: QueryClient,
  hookRef: React.RefObject<HookHandle | null>,
  notes: readonly string[],
) {
  act(() => {
    hookRef.current?.regenerate();
  });
  // Several flush+rerender cycles to let getStoredProvider/getStoredModel/invoke/onSuccess|onError settle.
  for (let i = 0; i < 8; i++) {
    await flushPromises();
    act(() => {
      renderer.update(renderHarness(queryClient, hookRef, notes));
    });
  }
}

describe("useReportGeneration — error and degraded responses", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getStoredProviderMock.mockResolvedValue("kimi");
    getStoredModelMock.mockResolvedValue("kimi-k2-0711-preview");
  });

  it("surfaces HTTP 502 (LLM_PARSE_ERROR) without crashing", async () => {
    invokeMock.mockResolvedValueOnce({
      data: null,
      error: Object.assign(new Error("LLM returned invalid JSON"), { status: 502 }),
    });

    const hookRef = React.createRef<HookHandle>();
    const queryClient = createQueryClient();
    let renderer!: TestRenderer.ReactTestRenderer;

    act(() => {
      renderer = TestRenderer.create(renderHarness(queryClient, hookRef, ["note 1"]));
    });
    await flushPromises();
    await triggerAndWait(renderer, queryClient, hookRef, ["note 1"]);

    expect(hookRef.current?.report).toBeNull();
    expect(hookRef.current?.error).toMatch(/HTTP 502|invalid JSON/i);
    expect(hookRef.current?.rawResponse).toMatchObject({
      _error: true,
      status: 502,
    });
    expect(hookRef.current?.lastGeneration?.error).toMatch(/HTTP 502|invalid JSON/i);

    act(() => {
      renderer.unmount();
    });
  });

  it("surfaces network rejection without crashing", async () => {
    invokeMock.mockResolvedValueOnce({
      data: null,
      error: new Error("Network request failed"),
    });

    const hookRef = React.createRef<HookHandle>();
    const queryClient = createQueryClient();
    let renderer!: TestRenderer.ReactTestRenderer;

    act(() => {
      renderer = TestRenderer.create(renderHarness(queryClient, hookRef, ["note 1"]));
    });
    await flushPromises();
    await triggerAndWait(renderer, queryClient, hookRef, ["note 1"]);

    expect(hookRef.current?.report).toBeNull();
    expect(hookRef.current?.error).toMatch(/network|failed/i);
    expect(hookRef.current?.lastGeneration?.error).toMatch(/network|failed/i);

    act(() => {
      renderer.unmount();
    });
  });

  it("surfaces malformed payload (normalizer rejects) with Debug-tab hint", async () => {
    invokeMock.mockResolvedValueOnce({
      data: { report: "this is not a report object" },
      error: null,
    });

    const hookRef = React.createRef<HookHandle>();
    const queryClient = createQueryClient();
    let renderer!: TestRenderer.ReactTestRenderer;

    act(() => {
      renderer = TestRenderer.create(renderHarness(queryClient, hookRef, ["note 1"]));
    });
    await flushPromises();
    await triggerAndWait(renderer, queryClient, hookRef, ["note 1"]);

    expect(hookRef.current?.report).toBeNull();
    expect(hookRef.current?.error).toMatch(/Unexpected response format/i);
    expect(hookRef.current?.rawResponse).toEqual({
      report: "this is not a report object",
    });

    act(() => {
      renderer.unmount();
    });
  });

  it("surfaces empty/null payload without crashing", async () => {
    invokeMock.mockResolvedValueOnce({ data: null, error: null });

    const hookRef = React.createRef<HookHandle>();
    const queryClient = createQueryClient();
    let renderer!: TestRenderer.ReactTestRenderer;

    act(() => {
      renderer = TestRenderer.create(renderHarness(queryClient, hookRef, ["note 1"]));
    });
    await flushPromises();
    await triggerAndWait(renderer, queryClient, hookRef, ["note 1"]);

    expect(hookRef.current?.report).toBeNull();
    expect(hookRef.current?.error).toMatch(/Unexpected response format/i);

    act(() => {
      renderer.unmount();
    });
  });

  it("recovers after a failure when a follow-up regenerate() succeeds", async () => {
    const fx = await loadFixture("quiet-day");
    const expectedTitle = (fx.response.report as { meta?: { title?: string } }).meta?.title;
    if (!expectedTitle) {
      throw new Error("quiet-day fixture is missing meta.title");
    }

    invokeMock
      .mockResolvedValueOnce({
        data: null,
        error: Object.assign(new Error("Bad gateway"), { status: 502 }),
      })
      .mockResolvedValueOnce({ data: fx.response, error: null });

    const hookRef = React.createRef<HookHandle>();
    const queryClient = createQueryClient();
    let renderer!: TestRenderer.ReactTestRenderer;

    act(() => {
      renderer = TestRenderer.create(renderHarness(queryClient, hookRef, ["note 1"]));
    });
    await flushPromises();
    await triggerAndWait(renderer, queryClient, hookRef, ["note 1"]);

    expect(hookRef.current?.error).toMatch(/HTTP 502|Bad gateway/i);
    expect(hookRef.current?.report).toBeNull();

    // Same notes, retry — uses notes array currently provided.
    await triggerAndWait(renderer, queryClient, hookRef, ["note 1"]);

    expect(invokeMock).toHaveBeenCalledTimes(2);
    expect(hookRef.current?.report).not.toBeNull();
    expect(hookRef.current?.report?.report.meta.title).toBe(expectedTitle);

    act(() => {
      renderer.unmount();
    });
  });
});

describe("useReportGeneration — captured fixture happy path", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getStoredProviderMock.mockResolvedValue("kimi");
    getStoredModelMock.mockResolvedValue("kimi-k2-0711-preview");
  });

  it("normalises a captured Kimi response to a valid GeneratedSiteReport", async () => {
    const fx = await loadFixture("quiet-day");
    invokeMock.mockResolvedValueOnce({ data: fx.response, error: null });

    const hookRef = React.createRef<HookHandle>();
    const queryClient = createQueryClient();
    let renderer!: TestRenderer.ReactTestRenderer;

    act(() => {
      renderer = TestRenderer.create(renderHarness(queryClient, hookRef, fx.input.notes));
    });
    await flushPromises();
    await triggerAndWait(renderer, queryClient, hookRef, fx.input.notes);

    const report = hookRef.current?.report;
    expect(report).not.toBeNull();
    expect(report?.report.meta.title.length).toBeGreaterThan(0);
    expect(Array.isArray(report?.report.sections)).toBe(true);
    expect(hookRef.current?.error).toBeNull();

    act(() => {
      renderer.unmount();
    });
  });
});
