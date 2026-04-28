/**
 * Error-case tests for useReportGeneration.
 *
 * Complements useReportGeneration.test.tsx (happy paths + queueing) by
 * exercising the failure surfaces the UI must handle:
 *
 *   - Edge function returns an HTTP error (5xx, 4xx)
 *   - Network call rejects (connection refused, abort, etc.)
 *   - Edge function returns a malformed payload (LLM produced unparseable
 *     JSON or schema-incompatible JSON, normalizeGeneratedReportPayload → null)
 *   - Edge function returns an empty/null payload
 *
 * The hook must surface a user-readable error string on `error`, never crash,
 * and always populate `rawResponse` so the Debug tab can show what came back.
 *
 * One test uses a captured LLM fixture (from supabase/functions/generate-report/fixtures/)
 * to ensure happy-path regressions stay caught with realistic data.
 */

import React, { forwardRef, useImperativeHandle } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TestRenderer, { act } from "react-test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useReportGeneration } from "./useReportGeneration";
import { loadFixture } from "@/lib/test-fixtures";

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

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

async function flushQueuedDebounce() {
  await act(async () => {
    vi.advanceTimersByTime(1500);
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("useReportGeneration — error and degraded responses", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    getStoredProviderMock.mockResolvedValue("kimi");
    getStoredModelMock.mockResolvedValue("kimi-k2-0711-preview");
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.IS_REACT_ACT_ENVIRONMENT = false;
  });

  it("surfaces HTTP 502 (LLM_PARSE_ERROR) without crashing", async () => {
    invokeMock.mockResolvedValueOnce({
      data: null,
      error: Object.assign(new Error("LLM returned invalid JSON"), {
        status: 502,
      }),
    });

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

    await flushQueuedDebounce();

    expect(hookRef.current?.report).toBeNull();
    expect(hookRef.current?.error).toMatch(/HTTP 502|invalid JSON/i);
    // rawResponse must always be populated so the Debug tab can show what came back.
    expect(hookRef.current?.rawResponse).toMatchObject({
      _error: true,
      status: 502,
    });

    await act(async () => {
      renderer.unmount();
    });
  });

  it("surfaces HTTP 500 generic error without crashing", async () => {
    invokeMock.mockResolvedValueOnce({
      data: null,
      error: Object.assign(new Error("Internal Server Error"), { status: 500 }),
    });

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

    await flushQueuedDebounce();

    expect(hookRef.current?.report).toBeNull();
    expect(hookRef.current?.error).toMatch(/HTTP 500|Internal Server Error/i);

    await act(async () => {
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

    await act(async () => {
      renderer = TestRenderer.create(renderHarness(queryClient, hookRef, []));
    });

    await act(async () => {
      renderer.update(renderHarness(queryClient, hookRef, ["note 1"]));
      hookRef.current?.bumpNotesVersion();
    });

    await flushQueuedDebounce();

    expect(hookRef.current?.report).toBeNull();
    expect(hookRef.current?.error).toMatch(/network|failed/i);

    await act(async () => {
      renderer.unmount();
    });
  });

  it("surfaces malformed payload (normalizer rejects) with Debug-tab hint", async () => {
    // Edge function returned data, but it doesn't match the report schema —
    // e.g. the LLM emitted a totally invalid shape that even Zod can't coerce.
    invokeMock.mockResolvedValueOnce({
      data: { report: "this is not a report object" },
      error: null,
    });

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

    await flushQueuedDebounce();

    expect(hookRef.current?.report).toBeNull();
    expect(hookRef.current?.error).toMatch(/Unexpected response format/i);
    // rawResponse must be set so the user can inspect what came back.
    expect(hookRef.current?.rawResponse).toEqual({
      report: "this is not a report object",
    });

    await act(async () => {
      renderer.unmount();
    });
  });

  it("surfaces empty/null payload without crashing", async () => {
    invokeMock.mockResolvedValueOnce({ data: null, error: null });

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

    await flushQueuedDebounce();

    expect(hookRef.current?.report).toBeNull();
    expect(hookRef.current?.error).toMatch(/Unexpected response format/i);

    await act(async () => {
      renderer.unmount();
    });
  });

  it("recovers after a failure when a follow-up succeeds", async () => {
    const fx = await loadFixture("quiet-day");
    const expectedTitle = (
      fx.response.report as { meta?: { title?: string } }
    ).meta?.title;
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

    await act(async () => {
      renderer = TestRenderer.create(renderHarness(queryClient, hookRef, []));
    });

    await act(async () => {
      renderer.update(renderHarness(queryClient, hookRef, ["note 1"]));
      hookRef.current?.bumpNotesVersion();
    });
    await flushQueuedDebounce();

    expect(hookRef.current?.error).toMatch(/HTTP 502|Bad gateway/i);
    expect(hookRef.current?.report).toBeNull();

    // Second attempt with new notes succeeds.
    await act(async () => {
      renderer.update(renderHarness(queryClient, hookRef, ["note 1", "note 2"]));
      hookRef.current?.bumpNotesVersion();
    });
    await flushQueuedDebounce();

    expect(invokeMock).toHaveBeenCalledTimes(2);
    expect(hookRef.current?.report).not.toBeNull();
    expect(hookRef.current?.report?.report.meta.title).toBe(expectedTitle);

    await act(async () => {
      renderer.unmount();
    });
  });
});

describe("useReportGeneration — captured fixture happy path", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    getStoredProviderMock.mockResolvedValue("kimi");
    getStoredModelMock.mockResolvedValue("kimi-k2-0711-preview");
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.IS_REACT_ACT_ENVIRONMENT = false;
  });

  it("normalises a captured Kimi response to a valid GeneratedSiteReport", async () => {
    const fx = await loadFixture("quiet-day");
    invokeMock.mockResolvedValueOnce({ data: fx.response, error: null });

    const hookRef = React.createRef<HookHandle>();
    const queryClient = createQueryClient();
    let renderer!: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(renderHarness(queryClient, hookRef, []));
    });

    await act(async () => {
      renderer.update(renderHarness(queryClient, hookRef, fx.input.notes));
      hookRef.current?.bumpNotesVersion();
    });
    await flushQueuedDebounce();

    const report = hookRef.current?.report;
    expect(report).not.toBeNull();
    expect(report?.report.meta.title.length).toBeGreaterThan(0);
    expect(Array.isArray(report?.report.sections)).toBe(true);
    expect(hookRef.current?.error).toBeNull();

    await act(async () => {
      renderer.unmount();
    });
  });
});
