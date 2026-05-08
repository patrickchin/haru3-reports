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
const rpcMock = vi.fn();
vi.mock("@/lib/backend", () => ({
  backend: {
    from: (...a: unknown[]) => fromMock(...a),
    rpc: (...a: unknown[]) => rpcMock(...a),
  },
}));

const useAuthMock = vi.fn();
vi.mock("@/lib/auth", () => ({
  useAuth: () => useAuthMock(),
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

const mountedRenderers: TestRenderer.ReactTestRenderer[] = [];

afterEach(() => {
  act(() => {
    for (const renderer of mountedRenderers) {
      renderer.unmount();
    }
    mountedRenderers.length = 0;
  });
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
  let renderer: TestRenderer.ReactTestRenderer | null = null;
  act(() => {
    renderer = TestRenderer.create(
      React.createElement(
        QueryClientProvider,
        { client: qc },
        React.createElement(Probe),
      ),
    );
  });
  if (renderer) mountedRenderers.push(renderer);
  return ref;
}

async function flushAsync() {
  // Let useQuery's queryFn promise resolve and the state update commit.
  // Promise.resolve microtasks alone aren't enough — react-query schedules
  // its setState through a macrotask boundary in test envs.
  await new Promise((r) => setTimeout(r, 10));
}

// ---------------------------------------------------------------------------
// useLocalReports — list
// ---------------------------------------------------------------------------
describe("useLocalReports (REST)", () => {
  it("lists reports for a project ordered by created_at desc", async () => {
    const builder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({
        data: [
          {
            id: "r1",
            title: "T1",
            report_type: "daily",
            status: "draft",
            visit_date: null,
            created_at: "t1",
          },
        ],
        error: null,
      }),
    };
    fromMock.mockReturnValue(builder);

    const mod = await import("@/hooks/useLocalReports");
    const qc = makeQueryClient();
    const ref = renderHook(() => mod.useLocalReports("p1"), qc);
    await act(async () => {
      await flushAsync();
    });
    expect(builder.eq).toHaveBeenCalledWith("project_id", "p1");
    expect(builder.order).toHaveBeenCalledWith("created_at", {
      ascending: false,
    });
    expect(ref.current.data).toHaveLength(1);
    expect(ref.current.data?.[0]?.id).toBe("r1");
  });

  it("is disabled when projectId is null", async () => {
    const mod = await import("@/hooks/useLocalReports");
    const qc = makeQueryClient();
    const ref = renderHook(() => mod.useLocalReports(null), qc);
    await act(async () => {
      await flushAsync();
    });
    expect(ref.current.fetchStatus).toBe("idle");
    expect(fromMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// useLocalReport — detail
// ---------------------------------------------------------------------------
describe("useLocalReport (REST)", () => {
  it("fetches and normalises a single report detail", async () => {
    const builder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: {
          id: "r1",
          project_id: "p1",
          title: "T",
          report_type: "daily",
          status: "draft",
          visit_date: null,
          report_data: { foo: 1 },
          last_generation: null,
          confidence: 0.8,
          created_at: "t1",
        },
        error: null,
      }),
    };
    fromMock.mockReturnValue(builder);

    const mod = await import("@/hooks/useLocalReports");
    const qc = makeQueryClient();
    const ref = renderHook(() => mod.useLocalReport("r1"), qc);
    await act(async () => {
      await flushAsync();
    });
    expect(ref.current.data?.report_data).toEqual({ foo: 1 });
    expect(ref.current.data?.confidence).toBe(0.8);
  });
});

// ---------------------------------------------------------------------------
// useLocalReportMutations
// ---------------------------------------------------------------------------
describe("useLocalReportMutations (REST)", () => {
  it("create inserts a draft report and returns the id", async () => {
    const builder = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: "r-new" }, error: null }),
    };
    fromMock.mockReturnValue(builder);

    const mod = await import("@/hooks/useLocalReports");
    const qc = makeQueryClient();
    const ref = renderHook(() => mod.useLocalReportMutations(), qc);
    let result: { id: string } | undefined;
    await act(async () => {
      result = await ref.current.create.mutateAsync({
        projectId: "p1",
        title: "New report",
        reportType: "daily",
        optimisticId: "00000000-0000-4000-8000-000000000001",
      });
      await flushAsync();
    });
    expect(builder.insert).toHaveBeenCalledWith({
      id: "00000000-0000-4000-8000-000000000001",
      project_id: "p1",
      owner_id: "user-1",
      title: "New report",
      report_type: "daily",
      status: "draft",
    });
    expect(result).toEqual({ id: "r-new" });
  });

  it("create omits id when no optimisticId is supplied", async () => {
    const builder = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: "r-new" }, error: null }),
    };
    fromMock.mockReturnValue(builder);

    const mod = await import("@/hooks/useLocalReports");
    const qc = makeQueryClient();
    const ref = renderHook(() => mod.useLocalReportMutations(), qc);
    await act(async () => {
      await ref.current.create.mutateAsync({
        projectId: "p1",
        title: "New report",
        reportType: "daily",
      });
      await flushAsync();
    });
    expect(builder.insert).toHaveBeenCalledWith({
      project_id: "p1",
      owner_id: "user-1",
      title: "New report",
      report_type: "daily",
      status: "draft",
    });
  });

  it("create inserts the optimistic id used by immediate draft navigation", async () => {
    const builder = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi
        .fn()
        .mockResolvedValue({ data: { id: "optimistic-report-id" }, error: null }),
    };
    fromMock.mockReturnValue(builder);

    const mod = await import("@/hooks/useLocalReports");
    const qc = makeQueryClient();
    const ref = renderHook(() => mod.useLocalReportMutations(), qc);
    await act(async () => {
      await ref.current.create.mutateAsync({
        projectId: "p1",
        reportType: "daily",
        optimisticId: "optimistic-report-id",
      });
      await flushAsync();
    });
    expect(builder.insert).toHaveBeenCalledWith(
      expect.objectContaining({ id: "optimistic-report-id" }),
    );
  });

  it("update applies fields by report id", async () => {
    const builder = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    };
    fromMock.mockReturnValue(builder);

    const mod = await import("@/hooks/useLocalReports");
    const qc = makeQueryClient();
    const ref = renderHook(() => mod.useLocalReportMutations(), qc);
    await act(async () => {
      await ref.current.update.mutateAsync({
        id: "r1",
        projectId: "p1",
        fields: { title: "Renamed" },
      });
      await flushAsync();
    });
    expect(builder.update).toHaveBeenCalledWith({ title: "Renamed" });
    expect(builder.eq).toHaveBeenCalledWith("id", "r1");
  });

  it("remove routes through soft_delete_report RPC", async () => {
    rpcMock.mockResolvedValue({ error: null });
    const mod = await import("@/hooks/useLocalReports");
    const qc = makeQueryClient();
    const ref = renderHook(() => mod.useLocalReportMutations(), qc);
    await act(async () => {
      await ref.current.remove.mutateAsync({ id: "r1", projectId: "p1" });
      await flushAsync();
    });
    expect(rpcMock).toHaveBeenCalledWith("soft_delete_report", { p_id: "r1" });
  });
});
