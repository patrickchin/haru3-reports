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
  await new Promise((r) => setTimeout(r, 10));
}

describe("useLocalReportNotes (REST)", () => {
  it("fetches notes for a report ordered by position, dropping soft-deleted rows", async () => {
    const builder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({
        data: [
          { id: "n1", report_id: "r1", project_id: "p1", author_id: "u1", position: 1, kind: "text", body: "a", file_id: null, deleted_at: null, created_at: "t", updated_at: "t" },
          { id: "n2", report_id: "r1", project_id: "p1", author_id: "u1", position: 2, kind: "text", body: "b", file_id: null, deleted_at: "t", created_at: "t", updated_at: "t" },
        ],
        error: null,
      }),
    };
    fromMock.mockReturnValue(builder);

    const mod = await import("@/hooks/useLocalReportNotes");
    const qc = makeQueryClient();
    const ref = renderHook(() => mod.useLocalReportNotes("r1"), qc);
    await act(async () => {
      await flushAsync();
    });
    expect(builder.eq).toHaveBeenCalledWith("report_id", "r1");
    expect(builder.order).toHaveBeenCalledWith("position", { ascending: true });
    expect(ref.current.data?.map((n) => n.id)).toEqual(["n1"]);
  });
});

describe("useOtherReportFileIds (REST)", () => {
  it("returns the set of file_ids on report_notes belonging to other reports in the same project", async () => {
    const builder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      not: vi.fn().mockResolvedValue({
        data: [{ file_id: "f1" }, { file_id: "f2" }, { file_id: null }],
        error: null,
      }),
    };
    fromMock.mockReturnValue(builder);

    const mod = await import("@/hooks/useLocalReportNotes");
    const qc = makeQueryClient();
    const ref = renderHook(() => mod.useOtherReportFileIds("p1", "r1"), qc);
    await act(async () => {
      await flushAsync();
    });
    expect(builder.eq).toHaveBeenCalledWith("project_id", "p1");
    expect(builder.neq).toHaveBeenCalledWith("report_id", "r1");
    expect(ref.current.data).toEqual(new Set(["f1", "f2"]));
  });
});

describe("useReportNotesMutations (REST)", () => {
  it("create assigns the next position and inserts the row", async () => {
    const maxBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { position: 4 },
        error: null,
      }),
    };
    const insertBuilder = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: {
          id: "n-new",
          report_id: "r1",
          project_id: "p1",
          author_id: "user-1",
          position: 5,
          kind: "text",
          body: "hi",
          file_id: null,
          deleted_at: null,
          created_at: "t",
          updated_at: "t",
        },
        error: null,
      }),
    };
    let call = 0;
    fromMock.mockImplementation(() => (call++ === 0 ? maxBuilder : insertBuilder));

    const mod = await import("@/hooks/useLocalReportNotes");
    const qc = makeQueryClient();
    const ref = renderHook(() => mod.useReportNotesMutations(), qc);
    let result: unknown;
    await act(async () => {
      result = await ref.current.create.mutateAsync({
        reportId: "r1",
        projectId: "p1",
        kind: "text",
        body: "hi",
      });
      await flushAsync();
    });
    expect(insertBuilder.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        report_id: "r1",
        project_id: "p1",
        author_id: "user-1",
        position: 5,
        kind: "text",
        body: "hi",
        file_id: null,
      }),
    );
    expect((result as { id: string }).id).toBe("n-new");
  });

  it("create assigns position=1 when the report has no live notes", async () => {
    const maxBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    const insertBuilder = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: "n-1", position: 1 }, error: null }),
    };
    let call = 0;
    fromMock.mockImplementation(() => (call++ === 0 ? maxBuilder : insertBuilder));

    const mod = await import("@/hooks/useLocalReportNotes");
    const qc = makeQueryClient();
    const ref = renderHook(() => mod.useReportNotesMutations(), qc);
    await act(async () => {
      await ref.current.create.mutateAsync({
        reportId: "r1",
        projectId: "p1",
        kind: "text",
      });
      await flushAsync();
    });
    expect(insertBuilder.insert).toHaveBeenCalledWith(
      expect.objectContaining({ position: 1 }),
    );
  });

  it("remove routes through soft_delete_report_note RPC", async () => {
    rpcMock.mockResolvedValue({ error: null });
    const mod = await import("@/hooks/useLocalReportNotes");
    const qc = makeQueryClient();
    const ref = renderHook(() => mod.useReportNotesMutations(), qc);
    await act(async () => {
      await ref.current.remove.mutateAsync({ id: "n1", reportId: "r1" });
      await flushAsync();
    });
    expect(rpcMock).toHaveBeenCalledWith("soft_delete_report_note", {
      p_id: "n1",
    });
  });
});
