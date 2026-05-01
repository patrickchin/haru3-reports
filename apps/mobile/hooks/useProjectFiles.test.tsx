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

// useFileUpload now also writes a `report_notes` row when reportId is
// supplied. Mock the SyncProvider so tests can choose between the
// passthrough (db === null, no local-first write) and the linked-write
// path (db is a fake executor that records createNote calls).
const useSyncDbMock = vi.fn();
vi.mock("@/lib/sync/SyncProvider", () => ({
  useSyncDb: () => useSyncDbMock(),
}));

const createNoteLocalMock = vi.fn();
vi.mock("@/lib/local-db/repositories/report-notes-repo", () => ({
  createNote: (...args: unknown[]) => createNoteLocalMock(...args),
}));

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  useAuthMock.mockReturnValue({ user: { id: "user-1" } });
  // Default: passthrough (cloud-only). Individual tests override this
  // when they want to exercise the local-first attach path.
  useSyncDbMock.mockReturnValue({
    db: null,
    clock: () => "2026-05-01T00:00:00Z",
    newId: () => "note-id-1",
    triggerPush: vi.fn(),
  });
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

  it("creates a report_notes row for image uploads attached to a report", async () => {
    // Regression test for orphan bug: when reportId is supplied, the
    // upload mutation must also write a `report_notes` row linking the
    // new file_metadata.id back to the report. Without this row, the
    // file would never appear in the report's source-notes list.
    readAsStringAsyncMock.mockResolvedValue("aGk=");
    uploadMock.mockResolvedValue({
      data: { path: "p-1/images/abc.jpg" },
      error: null,
    });
    const insertSingle = vi.fn().mockResolvedValue({
      data: {
        id: "f-1",
        project_id: "p-1",
        storage_path: "p-1/images/abc.jpg",
        thumbnail_path: null,
      },
      error: null,
    });
    const insertSelect = vi.fn(() => ({ single: insertSingle }));
    const insert = vi.fn(() => ({ select: insertSelect }));
    fromMock.mockImplementation((table: string) => {
      if (table === "file_metadata") return { insert };
      throw new Error(`unexpected table ${table}`);
    });

    const triggerPush = vi.fn();
    useSyncDbMock.mockReturnValue({
      db: { fake: true },
      clock: () => "2026-05-01T00:00:00Z",
      newId: () => "note-id-1",
      triggerPush,
    });
    createNoteLocalMock.mockResolvedValue({ id: "n-1" });

    const { useFileUpload } = await import("./useProjectFiles");
    const qc = makeQueryClient();
    const result = renderHook(() => useFileUpload(), qc);

    await act(async () => {
      await result.current.mutateAsync({
        projectId: "p-1",
        reportId: "r-1",
        category: "image",
        fileUri: "file:///tmp/abc.jpg",
        filename: "abc.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 2,
      });
    });

    expect(createNoteLocalMock).toHaveBeenCalledTimes(1);
    expect(createNoteLocalMock).toHaveBeenCalledWith(
      expect.objectContaining({ db: { fake: true } }),
      expect.objectContaining({
        reportId: "r-1",
        projectId: "p-1",
        kind: "image",
        body: null,
        fileId: "f-1",
      }),
    );
    expect(triggerPush).toHaveBeenCalled();
  });

  it("maps document category to kind='document' in the report_notes row", async () => {
    readAsStringAsyncMock.mockResolvedValue("aGk=");
    uploadMock.mockResolvedValue({
      data: { path: "p-1/documents/file.pdf" },
      error: null,
    });
    const insertSingle = vi.fn().mockResolvedValue({
      data: {
        id: "f-doc",
        project_id: "p-1",
        storage_path: "p-1/documents/file.pdf",
      },
      error: null,
    });
    fromMock.mockImplementation(() => ({
      insert: () => ({ select: () => ({ single: insertSingle }) }),
    }));

    useSyncDbMock.mockReturnValue({
      db: { fake: true },
      clock: () => "2026-05-01T00:00:00Z",
      newId: () => "note-id-2",
      triggerPush: vi.fn(),
    });
    createNoteLocalMock.mockResolvedValue({ id: "n-doc" });

    const { useFileUpload } = await import("./useProjectFiles");
    const qc = makeQueryClient();
    const result = renderHook(() => useFileUpload(), qc);

    await act(async () => {
      await result.current.mutateAsync({
        projectId: "p-1",
        reportId: "r-1",
        category: "document",
        fileUri: "file:///tmp/file.pdf",
        filename: "file.pdf",
        mimeType: "application/pdf",
        sizeBytes: 2,
      });
    });

    expect(createNoteLocalMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ kind: "document", fileId: "f-doc" }),
    );
  });

  it("rolls back the uploaded file when the report_notes insert fails", async () => {
    // If the storage + file_metadata writes succeed but the local
    // report_notes insert throws, we must remove the orphan from
    // storage and bubble the error. Otherwise we'd permanently leak
    // exactly the kind of unreferenced file_metadata row this whole
    // fix is about.
    readAsStringAsyncMock.mockResolvedValue("aGk=");
    uploadMock.mockResolvedValue({
      data: { path: "p-1/images/orphan.jpg" },
      error: null,
    });
    const insertSingle = vi.fn().mockResolvedValue({
      data: {
        id: "f-orphan",
        project_id: "p-1",
        storage_path: "p-1/images/orphan.jpg",
        thumbnail_path: null,
      },
      error: null,
    });
    const eqDelete = vi.fn().mockResolvedValue({ data: null, error: null });
    const eqUpdate = vi.fn().mockResolvedValue({ data: null, error: null });
    fromMock.mockImplementation((table: string) => {
      if (table === "file_metadata") {
        return {
          insert: () => ({ select: () => ({ single: insertSingle }) }),
          delete: () => ({ eq: eqDelete }),
        };
      }
      if (table === "report_notes") {
        // The cascade soft-delete inside deleteProjectFile.
        return { update: () => ({ eq: eqUpdate }) };
      }
      throw new Error(`unexpected table ${table}`);
    });
    removeStorageMock.mockResolvedValue({ data: null, error: null });

    useSyncDbMock.mockReturnValue({
      db: { fake: true },
      clock: () => "2026-05-01T00:00:00Z",
      newId: () => "note-id-3",
      triggerPush: vi.fn(),
    });
    createNoteLocalMock.mockRejectedValue(new Error("local SQLite write failed"));

    const { useFileUpload } = await import("./useProjectFiles");
    const qc = makeQueryClient();
    const result = renderHook(() => useFileUpload(), qc);

    await expect(
      act(async () => {
        await result.current.mutateAsync({
          projectId: "p-1",
          reportId: "r-1",
          category: "image",
          fileUri: "file:///tmp/orphan.jpg",
          filename: "orphan.jpg",
          mimeType: "image/jpeg",
          sizeBytes: 2,
        });
      }),
    ).rejects.toThrow(/local SQLite write failed/);

    // Rollback: file_metadata row deleted AND storage object removed.
    // The storage path is generated by uploadProjectFile (uuid-based);
    // we just need to confirm a single removal call was made for the
    // path under the project's images/ prefix.
    expect(eqDelete).toHaveBeenCalledWith("id", "f-orphan");
    expect(removeStorageMock).toHaveBeenCalledTimes(1);
    expect(removeStorageMock.mock.calls[0][0]).toEqual([
      expect.stringMatching(/^p-1\/images\/.+\.jpg$/),
    ]);
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
