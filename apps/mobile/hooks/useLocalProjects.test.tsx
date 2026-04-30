import React from "react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import TestRenderer, { act } from "react-test-renderer";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
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

// Mock the repository so we can spy on the local-first path without
// setting up a real SQLite database.
const listAccessibleProjectsMock = vi.fn();
const listMemberRolesMock = vi.fn();
const getProjectMock = vi.fn();
const createProjectMock = vi.fn();
const updateProjectMock = vi.fn();
const softDeleteProjectMock = vi.fn();
vi.mock("@/lib/local-db/repositories/projects-repo", () => ({
  listAccessibleProjects: (...a: unknown[]) => listAccessibleProjectsMock(...a),
  listMemberRoles: (...a: unknown[]) => listMemberRolesMock(...a),
  getProject: (...a: unknown[]) => getProjectMock(...a),
  createProject: (...a: unknown[]) => createProjectMock(...a),
  updateProject: (...a: unknown[]) => updateProjectMock(...a),
  softDeleteProject: (...a: unknown[]) => softDeleteProjectMock(...a),
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
  if (renderer) {
    mountedRenderers.push(renderer);
  }
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
const passthroughSync = {
  db: null,
  clock: () => "2024-01-01T00:00:00.000Z",
  newId: () => "id-1",
  triggerPush: vi.fn(),
  triggerPull: vi.fn().mockResolvedValue(undefined),
  onPushComplete: () => () => {},
  onPullComplete: () => () => {},
};
const localSync = {
  ...passthroughSync,
  db: FAKE_DB,
};

describe("useLocalProjects (cloud fallback)", () => {
  beforeEach(() => useSyncDbMock.mockReturnValue(passthroughSync));

  it("queries projects via backend and merges roles", async () => {
    const projectsBuilder: Record<string, unknown> = {};
    projectsBuilder.order = vi.fn().mockResolvedValue({
      data: [
        { id: "p-1", name: "P1", address: null, updated_at: "t", owner_id: "user-1" },
        { id: "p-2", name: "P2", address: null, updated_at: "t", owner_id: "other" },
      ],
      error: null,
    });
    const projectsSelect = vi.fn(() => projectsBuilder);
    const membersBuilder: Record<string, unknown> = {};
    membersBuilder.eq = vi.fn().mockResolvedValue({
      data: [{ project_id: "p-2", role: "editor" }],
      error: null,
    });
    const membersSelect = vi.fn(() => membersBuilder);
    fromMock.mockImplementation((tbl: string) => {
      if (tbl === "projects") return { select: projectsSelect };
      if (tbl === "project_members") return { select: membersSelect };
      throw new Error(`unexpected table ${tbl}`);
    });

    const { useLocalProjects } = await import("./useLocalProjects");
    const qc = makeQueryClient();
    const ref = renderHook(() => useLocalProjects("user-1"), qc);

    await flush();
    expect(ref.current.data).toEqual([
      { id: "p-1", name: "P1", address: null, updated_at: "t", owner_id: "user-1", role: "owner" },
      { id: "p-2", name: "P2", address: null, updated_at: "t", owner_id: "other", role: "editor" },
    ]);
    expect(listAccessibleProjectsMock).not.toHaveBeenCalled();
  });

  it("create mutation calls backend insert", async () => {
    const single = vi.fn().mockResolvedValue({ data: { id: "p-new" }, error: null });
    const select = vi.fn(() => ({ single }));
    const insert = vi.fn(() => ({ select }));
    fromMock.mockReturnValue({ insert });

    const { useLocalProjectMutations } = await import("./useLocalProjects");
    const qc = makeQueryClient();
    const ref = renderHook(() => useLocalProjectMutations(), qc);

    await act(async () => {
      await ref.current.create.mutateAsync({ name: "New" });
    });
    expect(insert).toHaveBeenCalledWith({
      name: "New",
      address: null,
      client_name: null,
      owner_id: "user-1",
    });
    expect(createProjectMock).not.toHaveBeenCalled();
  });
});

describe("useLocalProjects (local-first)", () => {
  beforeEach(() => useSyncDbMock.mockReturnValue(localSync));

  it("reads via repo and assigns roles", async () => {
    listAccessibleProjectsMock.mockResolvedValue([
      { id: "p-1", name: "P1", address: null, updated_at: "t", owner_id: "user-1" },
      { id: "p-2", name: "P2", address: null, updated_at: "t", owner_id: "other" },
    ]);
    listMemberRolesMock.mockResolvedValue(new Map([["p-2", "editor"]]));

    const { useLocalProjects } = await import("./useLocalProjects");
    const qc = makeQueryClient();
    const ref = renderHook(() => useLocalProjects("user-1"), qc);

    await waitForAssertion(() => {
      expect(ref.current.data).toEqual([
        expect.objectContaining({ id: "p-1", role: "owner" }),
        expect.objectContaining({ id: "p-2", role: "editor" }),
      ]);
    });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("triggers an immediate pull when the projects cache is empty", async () => {
    const triggerPull = vi.fn().mockResolvedValue(undefined);
    useSyncDbMock.mockReturnValue({ ...localSync, triggerPull });
    listAccessibleProjectsMock.mockResolvedValue([]);
    listMemberRolesMock.mockResolvedValue(new Map());

    const { useLocalProjects } = await import("./useLocalProjects");
    const qc = makeQueryClient();
    renderHook(() => useLocalProjects("user-1"), qc);

    await waitForAssertion(() => {
      expect(triggerPull).toHaveBeenCalledTimes(1);
    });
  });

  it("invalidates the empty projects query after the immediate pull settles", async () => {
    let resolvePull: () => void = () => {};
    const triggerPull = vi.fn(
      () => new Promise<void>((resolve) => { resolvePull = resolve; }),
    );
    useSyncDbMock.mockReturnValue({ ...localSync, triggerPull });
    listAccessibleProjectsMock.mockResolvedValue([]);
    listMemberRolesMock.mockResolvedValue(new Map());

    const { useLocalProjects } = await import("./useLocalProjects");
    const qc = makeQueryClient();
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");
    renderHook(() => useLocalProjects("user-1"), qc);

    await waitForAssertion(() => {
      expect(triggerPull).toHaveBeenCalledTimes(1);
    });
    expect(invalidateSpy).not.toHaveBeenCalledWith({
      queryKey: ["projects", "user-1", true],
    });

    resolvePull();
    await waitForAssertion(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ["projects", "user-1", true],
      });
    });
  });

  it("does not trigger an immediate pull when local projects are present", async () => {
    const triggerPull = vi.fn().mockResolvedValue(undefined);
    useSyncDbMock.mockReturnValue({ ...localSync, triggerPull });
    listAccessibleProjectsMock.mockResolvedValue([
      { id: "p-local", name: "Local", address: null, updated_at: "t", owner_id: "user-1" },
    ]);
    listMemberRolesMock.mockResolvedValue(new Map());

    const { useLocalProjects } = await import("./useLocalProjects");
    const qc = makeQueryClient();
    const ref = renderHook(() => useLocalProjects("user-1"), qc);

    await waitForAssertion(() => {
      expect(ref.current.data).toEqual([
        expect.objectContaining({ id: "p-local", role: "owner" }),
      ]);
    });

    expect(triggerPull).not.toHaveBeenCalled();
  });

  it("does not trigger an immediate pull when projects are already cached", async () => {
    const triggerPull = vi.fn().mockResolvedValue(undefined);
    useSyncDbMock.mockReturnValue({ ...localSync, triggerPull });
    listAccessibleProjectsMock.mockResolvedValue([]);
    listMemberRolesMock.mockResolvedValue(new Map());

    const { useLocalProjects } = await import("./useLocalProjects");
    const qc = makeQueryClient();
    qc.setQueryData(["projects", "user-1", true], [
      {
        id: "p-cached",
        name: "Cached",
        address: null,
        updated_at: "t",
        owner_id: "user-1",
        role: "owner",
      },
    ]);

    renderHook(() => useLocalProjects("user-1"), qc);

    await flush();

    expect(triggerPull).not.toHaveBeenCalled();
  });

  it("create mutation calls repo and triggers push", async () => {
    createProjectMock.mockResolvedValue({ id: "p-loc" });
    const triggerPush = vi.fn();
    useSyncDbMock.mockReturnValue({ ...localSync, triggerPush });

    const { useLocalProjectMutations } = await import("./useLocalProjects");
    const qc = makeQueryClient();
    const ref = renderHook(() => useLocalProjectMutations(), qc);

    let result: { id: string } | undefined;
    await act(async () => {
      result = await ref.current.create.mutateAsync({
        name: "New",
        address: "addr",
      });
    });
    expect(result).toEqual({ id: "p-loc" });
    expect(createProjectMock).toHaveBeenCalledWith(
      expect.objectContaining({ db: FAKE_DB }),
      expect.objectContaining({
        ownerId: "user-1",
        name: "New",
        address: "addr",
      }),
    );
    expect(triggerPush).toHaveBeenCalled();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("update mutation calls repo and triggers push", async () => {
    updateProjectMock.mockResolvedValue(undefined);
    const triggerPush = vi.fn();
    useSyncDbMock.mockReturnValue({ ...localSync, triggerPush });

    const { useLocalProjectMutations } = await import("./useLocalProjects");
    const qc = makeQueryClient();
    const ref = renderHook(() => useLocalProjectMutations(), qc);

    await act(async () => {
      await ref.current.update.mutateAsync({
        id: "p-1",
        fields: { name: "Updated" },
      });
    });
    expect(updateProjectMock).toHaveBeenCalledWith(
      expect.objectContaining({ db: FAKE_DB }),
      "p-1",
      { name: "Updated" },
    );
    expect(triggerPush).toHaveBeenCalled();
  });

  it("remove mutation soft-deletes locally", async () => {
    softDeleteProjectMock.mockResolvedValue(undefined);
    const triggerPush = vi.fn();
    useSyncDbMock.mockReturnValue({ ...localSync, triggerPush });

    const { useLocalProjectMutations } = await import("./useLocalProjects");
    const qc = makeQueryClient();
    const ref = renderHook(() => useLocalProjectMutations(), qc);

    await act(async () => {
      await ref.current.remove.mutateAsync("p-1");
    });
    expect(softDeleteProjectMock).toHaveBeenCalledWith(
      expect.objectContaining({ db: FAKE_DB }),
      "p-1",
    );
    expect(triggerPush).toHaveBeenCalled();
  });

  it("getProject fetches detail from repo", async () => {
    getProjectMock.mockResolvedValue({
      id: "p-1",
      name: "X",
      address: "A",
      client_name: "C",
    });
    const { useLocalProject } = await import("./useLocalProjects");
    const qc = makeQueryClient();
    const ref = renderHook(() => useLocalProject("p-1"), qc);
    await waitForAssertion(() => {
      expect(ref.current.data).toEqual({
        id: "p-1",
        name: "X",
        address: "A",
        client_name: "C",
      });
    });
  });

  // Regression: on first sign-in the local cache is empty; the initial
  // pull populates it but used to leave the React Query cache stale,
  // forcing the user to create a project before the existing server
  // projects appeared. The hook must invalidate when onPullComplete
  // reports rows for `projects` or `project_members`.
  it("invalidates the projects query when a pull applies new rows", async () => {
    let pullCb: ((evt: { tablesApplied: string[] }) => void) | null = null;
    const onPullComplete = vi.fn(
      (cb: (evt: { tablesApplied: string[] }) => void) => {
        pullCb = cb;
        return () => {
          pullCb = null;
        };
      },
    );

    // First read: empty cache (mirrors first sign-in state).
    listAccessibleProjectsMock.mockResolvedValueOnce([]);
    listMemberRolesMock.mockResolvedValueOnce(new Map());
    // Second read from the one-shot first-visit invalidation; the pull has
    // not reported rows yet, so the local DB is still empty.
    listAccessibleProjectsMock.mockResolvedValueOnce([]);
    listMemberRolesMock.mockResolvedValueOnce(new Map());
    // Third read after the pull notification — server rows landed.
    listAccessibleProjectsMock.mockResolvedValueOnce([
      { id: "p-1", name: "P1", address: null, updated_at: "t", owner_id: "user-1" },
    ]);
    listMemberRolesMock.mockResolvedValueOnce(new Map());

    useSyncDbMock.mockReturnValue({ ...localSync, onPullComplete });

    const { useLocalProjects } = await import("./useLocalProjects");
    const qc = makeQueryClient();
    const ref = renderHook(() => useLocalProjects("user-1"), qc);

    await waitForAssertion(() => {
      expect(ref.current.data).toEqual([]);
    });

    await act(async () => {
      pullCb?.({ tablesApplied: ["projects"] });
    });

    await waitForAssertion(() => {
      expect(ref.current.data).toEqual([
        expect.objectContaining({ id: "p-1", role: "owner" }),
      ]);
    });
  });

  it("ignores pull events for unrelated tables", async () => {
    let pullCb: ((evt: { tablesApplied: string[] }) => void) | null = null;
    const onPullComplete = vi.fn(
      (cb: (evt: { tablesApplied: string[] }) => void) => {
        pullCb = cb;
        return () => {};
      },
    );
    listAccessibleProjectsMock.mockResolvedValue([]);
    listMemberRolesMock.mockResolvedValue(new Map());
    useSyncDbMock.mockReturnValue({ ...localSync, onPullComplete });

    const { useLocalProjects } = await import("./useLocalProjects");
    const qc = makeQueryClient();
    const ref = renderHook(() => useLocalProjects("user-1"), qc);

    await waitForAssertion(() => {
      expect(ref.current.data).toEqual([]);
    });

    listAccessibleProjectsMock.mockClear();
    await act(async () => {
      pullCb?.({ tablesApplied: ["file_metadata"] });
    });
    // Give the query a chance to refetch if it were going to.
    await flush(5);
    expect(listAccessibleProjectsMock).not.toHaveBeenCalled();
  });
});
