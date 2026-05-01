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
  useQueryClient,
} from "@tanstack/react-query";
import TestRenderer, { act } from "react-test-renderer";

// ---------------------------------------------------------------------------
// Mocks. The hook imports backend (Supabase client), expo-file-system, and
// the auth context — all unavailable under Vitest.
// ---------------------------------------------------------------------------
const fromMock = vi.fn();
const uploadMock = vi.fn();
const deleteMock = vi.fn();
const createSignedUrlMock = vi.fn();
const removeStorageMock = vi.fn();
const readAsStringAsyncMock = vi.fn();

vi.mock("@/lib/backend", () => ({
  backend: {
    from: (...a: unknown[]) => fromMock(...a),
    storage: {
      from: () => ({
        upload: (...a: unknown[]) => uploadMock(...a),
        createSignedUrl: (...a: unknown[]) => createSignedUrlMock(...a),
        remove: (...a: unknown[]) => removeStorageMock(...a),
      }),
    },
  },
}));

const useAuthMock = vi.fn();
vi.mock("@/lib/auth", () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock("expo-file-system/legacy", () => ({
  readAsStringAsync: (...a: unknown[]) => readAsStringAsyncMock(...a),
  EncodingType: { Base64: "base64" },
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
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

/** Render a hook by calling it inside a test component. */
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

describe("useProjectFiles", () => {
  it("queries file_metadata filtered by project and category", async () => {
    // PostgREST builders are chainable AND awaitable. Build a thenable that
    // also exposes eq()/order() returning itself so we can verify the chain.
    const calls: Array<[string, ...unknown[]]> = [];
    const finalResult = { data: [{ id: "f-1" }], error: null };
    const builder: Record<string, unknown> = {};
    const record = (name: string) =>
      (...args: unknown[]) => {
        calls.push([name, ...args]);
        return builder;
      };
    builder.eq = record("eq");
    builder.order = record("order");
    builder.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve(finalResult).then(resolve);
    const select = vi.fn(() => builder);
    fromMock.mockReturnValue({ select });

    const { useProjectFiles } = await import("./useProjectFiles");
    const qc = makeQueryClient();
    const result = renderHook(
      () =>
        useProjectFiles({
          projectId: "p-1",
          category: "document",
        }),
      qc,
    );

    // Wait for the query to settle.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(fromMock).toHaveBeenCalledWith("file_metadata");
    expect(select).toHaveBeenCalledWith("*");
    expect(calls).toEqual(
      expect.arrayContaining<[string, ...unknown[]]>([
        ["eq", "project_id", "p-1"],
        ["order", "created_at", { ascending: false }],
        ["eq", "category", "document"],
      ]),
    );
    expect(result.current.data).toEqual([{ id: "f-1" }]);
  });

  it("is disabled when projectId is null", async () => {
    const { useProjectFiles } = await import("./useProjectFiles");
    const qc = makeQueryClient();
    const result = renderHook(
      () => useProjectFiles({ projectId: null }),
      qc,
    );
    expect(result.current.fetchStatus).toBe("idle");
    expect(fromMock).not.toHaveBeenCalled();
  });
});

describe("useFileUpload", () => {
  it("uploads bytes from the local URI and invalidates project-files cache on success", async () => {
    // base64 for "hi"
    readAsStringAsyncMock.mockResolvedValue("aGk=");
    uploadMock.mockResolvedValue({ data: { path: "p-1/documents/abc.pdf" }, error: null });
    const insertSingle = vi.fn().mockResolvedValue({
      data: {
        id: "f-1",
        project_id: "p-1",
        storage_path: "p-1/documents/abc.pdf",
      },
      error: null,
    });
    const insertSelect = vi.fn(() => ({ single: insertSingle }));
    const insert = vi.fn(() => ({ select: insertSelect }));
    fromMock.mockImplementation((table: string) => {
      if (table === "file_metadata") return { insert };
      throw new Error(`unexpected table ${table}`);
    });

    const { useFileUpload } = await import("./useProjectFiles");
    const qc = makeQueryClient();
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");

    const result = renderHook(() => {
      const upload = useFileUpload();
      const client = useQueryClient();
      void client; // touch to keep eslint happy
      return upload;
    }, qc);

    await act(async () => {
      await result.current.mutateAsync({
        projectId: "p-1",
        category: "document",
        fileUri: "file:///tmp/abc.pdf",
        filename: "abc.pdf",
        mimeType: "application/pdf",
        sizeBytes: 2,
      });
    });

    expect(readAsStringAsyncMock).toHaveBeenCalledWith(
      "file:///tmp/abc.pdf",
      { encoding: "base64" },
    );
    expect(uploadMock).toHaveBeenCalled();
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["project-files", "p-1"],
    });
  });

  it("rejects when no user is authenticated", async () => {
    useAuthMock.mockReturnValue({ user: null });
    const { useFileUpload } = await import("./useProjectFiles");
    const qc = makeQueryClient();
    const result = renderHook(() => useFileUpload(), qc);

    await expect(
      result.current.mutateAsync({
        projectId: "p-1",
        category: "document",
        fileUri: "file:///x",
        filename: "x",
        mimeType: "application/pdf",
        sizeBytes: 1,
      }),
    ).rejects.toThrow("Not authenticated");

    expect(uploadMock).not.toHaveBeenCalled();
  });
});

describe("useDeleteFile", () => {
  it("removes from storage, deletes the row, soft-deletes linked notes, and invalidates caches", async () => {
    removeStorageMock.mockResolvedValue({ data: null, error: null });
    const eqDelete = vi.fn().mockResolvedValue({ data: null, error: null });
    const del = vi.fn(() => ({ eq: eqDelete }));
    const eqUpdate = vi.fn().mockResolvedValue({ data: null, error: null });
    const update = vi.fn(() => ({ eq: eqUpdate }));
    fromMock.mockImplementation((table: string) => {
      if (table === "report_notes") return { update };
      return { delete: del };
    });

    const { useDeleteFile } = await import("./useProjectFiles");
    const qc = makeQueryClient();
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");
    const result = renderHook(() => useDeleteFile(), qc);

    await act(async () => {
      await result.current.mutateAsync({
        fileId: "f-1",
        storagePath: "p-1/documents/abc.pdf",
        projectId: "p-1",
      });
    });

    // Soft-deletes linked report_notes first.
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ deleted_at: expect.any(String) }),
    );
    expect(eqUpdate).toHaveBeenCalledWith("file_id", "f-1");

    expect(removeStorageMock).toHaveBeenCalledWith([
      "p-1/documents/abc.pdf",
    ]);
    expect(eqDelete).toHaveBeenCalledWith("id", "f-1");
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["project-files", "p-1"],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["report-notes"],
    });
  });
});

describe("useFileSignedUrl", () => {
  it("is disabled when storagePath is null/undefined", async () => {
    const { useFileSignedUrl } = await import("./useProjectFiles");
    const qc = makeQueryClient();
    const result = renderHook(() => useFileSignedUrl(null), qc);
    expect(result.current.fetchStatus).toBe("idle");
    expect(createSignedUrlMock).not.toHaveBeenCalled();
  });
});
