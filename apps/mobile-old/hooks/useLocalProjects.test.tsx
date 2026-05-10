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
// useLocalProjects
// ---------------------------------------------------------------------------
describe("useLocalProjects (REST)", () => {
  it("queries projects + memberships and merges role per project", async () => {
    const projectsBuilder = {
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({
        data: [
          { id: "p1", name: "P1", address: null, updated_at: "t1", owner_id: "user-1" },
          { id: "p2", name: "P2", address: null, updated_at: "t0", owner_id: "other" },
        ],
        error: null,
      }),
    };
    const membersBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({
        data: [{ project_id: "p2", role: "editor" }],
        error: null,
      }),
    };
    fromMock.mockImplementation((table: string) =>
      table === "projects" ? projectsBuilder : membersBuilder,
    );

    const mod = await import("@/hooks/useLocalProjects");

    const qc = makeQueryClient();
    const ref = renderHook(() => mod.useLocalProjects("user-1"), qc);
    await act(async () => {
      await flushAsync();
    });

    expect(ref.current.isSuccess).toBe(true);
    expect(ref.current.data).toEqual([
      {
        id: "p1",
        name: "P1",
        address: null,
        updated_at: "t1",
        owner_id: "user-1",
        role: "owner",
      },
      {
        id: "p2",
        name: "P2",
        address: null,
        updated_at: "t0",
        owner_id: "other",
        role: "editor",
      },
    ]);
    expect(ref.current.isLoadingInitialProjects).toBe(false);
  });

  it("is disabled when ownerId is null", async () => {
    const mod = await import("@/hooks/useLocalProjects");
    const qc = makeQueryClient();
    const ref = renderHook(() => mod.useLocalProjects(null), qc);
    await act(async () => {
      await flushAsync();
    });
    expect(ref.current.fetchStatus).toBe("idle");
    expect(fromMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// useLocalProject
// ---------------------------------------------------------------------------
describe("useLocalProject (REST)", () => {
  it("fetches a single project detail", async () => {
    const builder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { id: "p1", name: "P1", address: null, client_name: "Acme" },
        error: null,
      }),
    };
    fromMock.mockReturnValue(builder);

    const mod = await import("@/hooks/useLocalProjects");
    const qc = makeQueryClient();
    const ref = renderHook(() => mod.useLocalProject("p1"), qc);
    await act(async () => {
      await flushAsync();
    });
    expect(ref.current.data).toEqual({
      id: "p1",
      name: "P1",
      address: null,
      client_name: "Acme",
    });
  });
});

// ---------------------------------------------------------------------------
// useLocalProjectMutations
// ---------------------------------------------------------------------------
describe("useLocalProjectMutations (REST)", () => {
  it("create inserts via supabase-js and returns the new id", async () => {
    const builder = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: "p-new" }, error: null }),
    };
    fromMock.mockReturnValue(builder);

    const mod = await import("@/hooks/useLocalProjects");
    const qc = makeQueryClient();
    const ref = renderHook(() => mod.useLocalProjectMutations(), qc);
    let result: { id: string } | undefined;
    await act(async () => {
      result = await ref.current.create.mutateAsync({
        name: "New",
        address: null,
        clientName: "Acme",
      });
      await flushAsync();
    });
    expect(builder.insert).toHaveBeenCalledWith({
      name: "New",
      address: null,
      client_name: "Acme",
      owner_id: "user-1",
    });
    expect(result).toEqual({ id: "p-new" });
  });

  it("update updates the row by id", async () => {
    const builder = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    };
    fromMock.mockReturnValue(builder);

    const mod = await import("@/hooks/useLocalProjects");
    const qc = makeQueryClient();
    const ref = renderHook(() => mod.useLocalProjectMutations(), qc);
    await act(async () => {
      await ref.current.update.mutateAsync({
        id: "p1",
        fields: { name: "Renamed" },
      });
      await flushAsync();
    });
    expect(builder.update).toHaveBeenCalledWith({ name: "Renamed" });
    expect(builder.eq).toHaveBeenCalledWith("id", "p1");
  });

  it("remove routes through soft_delete_project RPC", async () => {
    rpcMock.mockResolvedValue({ error: null });
    const mod = await import("@/hooks/useLocalProjects");
    const qc = makeQueryClient();
    const ref = renderHook(() => mod.useLocalProjectMutations(), qc);
    await act(async () => {
      await ref.current.remove.mutateAsync("p1");
      await flushAsync();
    });
    expect(rpcMock).toHaveBeenCalledWith("soft_delete_project", { p_id: "p1" });
  });
});
