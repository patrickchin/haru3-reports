import React from "react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import TestRenderer, { act } from "react-test-renderer";

const fromMock = vi.fn();
vi.mock("@/lib/backend", () => ({
  backend: { from: (...a: unknown[]) => fromMock(...a) },
}));
const useAuthMock = vi.fn();
vi.mock("@/lib/auth", () => ({
  useAuth: () => useAuthMock(),
}));
const useSyncDbMock = vi.fn();
vi.mock("@/lib/sync/SyncProvider", () => ({
  useSyncDb: () => useSyncDbMock(),
}));

const listReportsMock = vi.fn();
const getReportMock = vi.fn();
const createReportMock = vi.fn();
const updateReportMock = vi.fn();
const softDeleteReportMock = vi.fn();
vi.mock("@/lib/local-db/repositories/reports-repo", () => ({
  listReports: (...a: unknown[]) => listReportsMock(...a),
  getReport: (...a: unknown[]) => getReportMock(...a),
  createReport: (...a: unknown[]) => createReportMock(...a),
  updateReport: (...a: unknown[]) => updateReportMock(...a),
  softDeleteReport: (...a: unknown[]) => softDeleteReportMock(...a),
}));

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  useAuthMock.mockReturnValue({ user: { id: "user-1" } });
});
afterEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
});

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function renderHook<T>(hookFn: () => T, qc: QueryClient): { current: T } {
  const ref: { current: T } = { current: undefined as unknown as T };
  function Probe() {
    ref.current = hookFn();
    return null;
  }
  act(() => {
    TestRenderer.create(
      React.createElement(
        QueryClientProvider,
        { client: qc },
        React.createElement(Probe),
      ),
    );
  });
  return ref;
}

async function flush(iterations = 30) {
  for (let i = 0; i < iterations; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

async function waitForAssertion(
  assertion: () => void,
  iterations = 60,
) {
  let lastError: unknown;
  for (let i = 0; i < iterations; i++) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
    }
    await flush(1);
  }
  throw lastError;
}

const FAKE_DB = { exec: vi.fn() };
const passthrough = {
  db: null,
  clock: () => "2024-01-01T00:00:00.000Z",
  newId: () => "id-1",
  triggerPush: vi.fn(),
  triggerPull: vi.fn(),
  onPushComplete: () => () => {},
  onPullComplete: () => () => {},
};
const localSync = { ...passthrough, db: FAKE_DB };

describe("useLocalReports (cloud fallback)", () => {
  beforeEach(() => useSyncDbMock.mockReturnValue(passthrough));

  it("queries reports via backend", async () => {
    const builder: Record<string, unknown> = {};
    builder.eq = vi.fn(() => builder);
    builder.order = vi.fn().mockResolvedValue({
      data: [
        { id: "r-1", title: "T", report_type: "daily", status: "draft", visit_date: null, created_at: "t" },
      ],
      error: null,
    });
    const select = vi.fn(() => builder);
    fromMock.mockReturnValue({ select });

    const { useLocalReports } = await import("./useLocalReports");
    const qc = makeQueryClient();
    const ref = renderHook(() => useLocalReports("p-1"), qc);
    await waitForAssertion(() => {
      expect(ref.current.data).toEqual([
        expect.objectContaining({ id: "r-1", title: "T" }),
      ]);
    });
    expect(listReportsMock).not.toHaveBeenCalled();
  });
});

describe("useLocalReports (local-first)", () => {
  beforeEach(() => useSyncDbMock.mockReturnValue(localSync));

  it("reads via repo", async () => {
    listReportsMock.mockResolvedValue([
      { id: "r-1", title: "T", report_type: "daily", status: "draft", visit_date: null, created_at: "t" },
    ]);
    const { useLocalReports } = await import("./useLocalReports");
    const qc = makeQueryClient();
    const ref = renderHook(() => useLocalReports("p-1"), qc);
    await waitForAssertion(() => {
      expect(ref.current.data).toEqual([
        expect.objectContaining({ id: "r-1" }),
      ]);
    });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("getReport returns parsed detail", async () => {
    getReportMock.mockResolvedValue({
      id: "r-1",
      project_id: "p-1",
      title: "T",
      report_type: "daily",
      status: "draft",
      visit_date: null,
      report_data: { foo: 1 },
      confidence: 0.5,
      generation_state: null,
      generation_error: null,
    });
    const { useLocalReport } = await import("./useLocalReports");
    const qc = makeQueryClient();
    const ref = renderHook(() => useLocalReport("r-1"), qc);
    await waitForAssertion(() => {
      expect(ref.current.data).toEqual(
        expect.objectContaining({
          id: "r-1",
          report_data: { foo: 1 },
        }),
      );
    });
  });

  it("create writes via repo and triggers push", async () => {
    createReportMock.mockResolvedValue({ id: "r-new" });
    const triggerPush = vi.fn();
    useSyncDbMock.mockReturnValue({ ...localSync, triggerPush });
    const { useLocalReportMutations } = await import("./useLocalReports");
    const qc = makeQueryClient();
    const ref = renderHook(() => useLocalReportMutations(), qc);
    let res: { id: string } | undefined;
    await act(async () => {
      res = await ref.current.create.mutateAsync({ projectId: "p-1" });
    });
    expect(res).toEqual({ id: "r-new" });
    expect(createReportMock).toHaveBeenCalledWith(
      expect.objectContaining({ db: FAKE_DB }),
      expect.objectContaining({
        projectId: "p-1",
        ownerId: "user-1",
        reportType: "daily",
      }),
    );
    expect(triggerPush).toHaveBeenCalled();
  });

  it("update writes via repo and triggers push", async () => {
    updateReportMock.mockResolvedValue(undefined);
    const triggerPush = vi.fn();
    useSyncDbMock.mockReturnValue({ ...localSync, triggerPush });
    const { useLocalReportMutations } = await import("./useLocalReports");
    const qc = makeQueryClient();
    const ref = renderHook(() => useLocalReportMutations(), qc);
    await act(async () => {
      await ref.current.update.mutateAsync({
        id: "r-1",
        projectId: "p-1",
        fields: { status: "final" },
      });
    });
    expect(updateReportMock).toHaveBeenCalledWith(
      expect.objectContaining({ db: FAKE_DB }),
      "r-1",
      { status: "final" },
    );
    expect(triggerPush).toHaveBeenCalled();
  });

  it("remove soft-deletes locally", async () => {
    softDeleteReportMock.mockResolvedValue(undefined);
    const triggerPush = vi.fn();
    useSyncDbMock.mockReturnValue({ ...localSync, triggerPush });
    const { useLocalReportMutations } = await import("./useLocalReports");
    const qc = makeQueryClient();
    const ref = renderHook(() => useLocalReportMutations(), qc);
    await act(async () => {
      await ref.current.remove.mutateAsync({ id: "r-1", projectId: "p-1" });
    });
    expect(softDeleteReportMock).toHaveBeenCalledWith(
      expect.objectContaining({ db: FAKE_DB }),
      "r-1",
    );
    expect(triggerPush).toHaveBeenCalled();
  });
});
