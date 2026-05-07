import { describe, expect, it, vi } from "vitest";
import {
  createUploadQueue,
  QUEUE_STORAGE_KEY,
  type StorageLike,
  type UploadQueueDeps,
} from "./queue";
import type { UploaderDeps, UploaderResult } from "./uploader";
import type { EnqueueInput } from "./jobs";
import type { BackendLike, FileMetadataRow } from "@/lib/file-upload";

// ---------- harness ----------

function memoryStorage(initial: Record<string, string> = {}): StorageLike & {
  data: Map<string, string>;
} {
  const data = new Map<string, string>(Object.entries(initial));
  return {
    data,
    getItem: async (k) => data.get(k) ?? null,
    setItem: async (k, v) => {
      data.set(k, v);
    },
    removeItem: async (k) => {
      data.delete(k);
    },
  };
}

function makeRow(overrides: Partial<FileMetadataRow> = {}): FileMetadataRow {
  return {
    id: "row-1",
    project_id: "proj-1",
    uploaded_by: "mike",
    bucket: "project-files",
    storage_path: "proj-1/images/uuid.jpg",
    category: "image",
    filename: "photo.jpg",
    mime_type: "image/jpeg",
    size_bytes: 4096,
    duration_ms: null,
    width: 2048,
    height: 1536,
    thumbnail_path: "proj-1/images/uuid.jpg.thumb.jpg",
    blurhash: null,
    deleted_at: null,
    created_at: "2026-05-08T00:00:00Z",
    updated_at: "2026-05-08T00:00:00Z",
    ...overrides,
  };
}

function makeImageInput(overrides: Partial<EnqueueInput> = {}): EnqueueInput {
  return {
    kind: "project-image",
    sourceUri: "file:///tmp/photo.jpg",
    filename: "photo.jpg",
    mimeType: "image/jpeg",
    sizeBytes: 100_000,
    projectId: "proj-1",
    reportId: null,
    uploadedBy: "mike",
    width: 4032,
    height: 3024,
    category: "image",
    isImage: true,
    ...overrides,
  };
}

function makeUploaderDeps(opts: {
  uploadResult?: UploaderResult | { throw: Error };
  uploadResults?: Array<UploaderResult | { throw: Error }>;
  deleteSpy?: ReturnType<typeof vi.fn>;
} = {}): UploaderDeps & { uploadProjectFile: ReturnType<typeof vi.fn> } {
  const queue: Array<UploaderResult | { throw: Error }> = opts.uploadResults
    ? [...opts.uploadResults]
    : [];
  const fallback: UploaderResult = {
    metadataRow: makeRow(),
    storagePath: "proj-1/images/uuid.jpg",
  };

  const uploadProjectFile = vi.fn(async () => {
    const next = queue.shift() ?? opts.uploadResult ?? fallback;
    if ("throw" in next) throw next.throw;
    return { metadata: next.metadataRow, storagePath: next.storagePath };
  });

  // Backend stub — only `from("report_notes")` may be touched. Return a
  // chain that yields no existing notes and successful insert (we set
  // reportId=null in tests so this is never hit).
  const reportNotesChain: Record<string, unknown> = {
    eq: () => reportNotesChain,
    is: () => reportNotesChain,
    order: () => reportNotesChain,
    limit: () => reportNotesChain,
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
  };
  const backend = {
    from: () => ({
      select: () => reportNotesChain,
      insert: () => Promise.resolve({ error: null }),
    }),
    storage: { from: () => ({}) },
    rpc: () => Promise.resolve({ data: null, error: null }),
  } as unknown as BackendLike;

  const uriToBlob = vi.fn(async () => ({
    blob: new Blob([new Uint8Array(8)], { type: "image/jpeg" }),
  }));
  const preprocess = vi.fn(async () => ({
    originalUri: "file:///tmp/resized.jpg",
    thumbnailUri: "file:///tmp/resized.thumb.jpg",
    width: 2048,
    height: 1536,
    mimeType: "image/jpeg" as const,
    blurhash: null,
  }));

  return {
    backend,
    uriToBlob: uriToBlob as never,
    preprocess: { preprocess: preprocess as never },
    uploadProjectFile: uploadProjectFile as never,
    deleteProjectFile: (opts.deleteSpy ?? vi.fn(async () => undefined)) as never,
    uuid: () => "row-uuid",
  } as never;
}

function makeQueueDeps(
  overrides: Partial<UploadQueueDeps> = {},
): UploadQueueDeps {
  return {
    storage: memoryStorage(),
    fileExists: async () => true,
    uploader: makeUploaderDeps(),
    persistDebounceMs: 0,
    schedule: (fn) => {
      // Run scheduled work on a microtask so test code can `await tick()`.
      Promise.resolve().then(fn);
      return 0;
    },
    uuid: (() => {
      let n = 0;
      return () => `job-${++n}`;
    })(),
    now: () => 1_700_000_000_000,
    ...overrides,
  };
}

// ---------- tests ----------

describe("UploadQueue", () => {
  it("enqueues, processes, and reaches uploaded state", async () => {
    const deps = makeQueueDeps();
    const q = createUploadQueue(deps);
    const id = q.enqueueUpload(makeImageInput());
    // tick() runs synchronously after enqueue, so state is already
    // 'preprocessing' here — just assert the eventual terminal state.
    await q.whenIdle();

    const job = q.getJob(id);
    expect(job?.state).toBe("uploaded");
    expect(job?.fileId).toBe("row-1");
    expect(job?.storagePath).toBe("proj-1/images/uuid.jpg");
    expect(job?.metadataRow?.id).toBe("row-1");
  });

  it("notifies subscribers on state changes", async () => {
    const deps = makeQueueDeps();
    const q = createUploadQueue(deps);
    const fn = vi.fn();
    q.subscribe(fn);
    q.enqueueUpload(makeImageInput());
    await q.whenIdle();
    expect(fn).toHaveBeenCalled();
    // Final notification should land after the upload completes.
    expect(q.getJobs()[0]?.state).toBe("uploaded");
  });

  it("processes jobs single-flight (one at a time, in insertion order)", async () => {
    let inflight = 0;
    let maxInflight = 0;
    const order: string[] = [];

    const uploader = makeUploaderDeps();
    (uploader.uploadProjectFile as ReturnType<typeof vi.fn>).mockImplementation(
      async () => {
        inflight += 1;
        maxInflight = Math.max(maxInflight, inflight);
        await new Promise((r) => setTimeout(r, 5));
        inflight -= 1;
        const row = makeRow({ id: `row-${order.length + 1}` });
        order.push(row.id);
        return { metadata: row, storagePath: `path/${row.id}` };
      },
    );

    const deps = makeQueueDeps({ uploader });
    const q = createUploadQueue(deps);
    q.enqueueUpload(makeImageInput());
    q.enqueueUpload(makeImageInput());
    q.enqueueUpload(makeImageInput());
    await q.whenIdle();

    expect(maxInflight).toBe(1);
    expect(order).toEqual(["row-1", "row-2", "row-3"]);
  });

  it("auto-retries on retryable errors and eventually succeeds", async () => {
    const uploader = makeUploaderDeps({
      uploadResults: [
        { throw: new Error("network timeout") },
        {
          metadataRow: makeRow({ id: "row-success" }),
          storagePath: "proj-1/images/success.jpg",
        },
      ],
    });
    const deps = makeQueueDeps({ uploader });
    const q = createUploadQueue(deps);
    const id = q.enqueueUpload(makeImageInput());
    await q.whenIdle();

    const job = q.getJob(id);
    expect(job?.state).toBe("uploaded");
    expect(job?.fileId).toBe("row-success");
    expect(job?.attempts).toBe(1);
    expect(uploader.uploadProjectFile).toHaveBeenCalledTimes(2);
  });

  it("does NOT auto-retry classified-terminal errors (e.g. unauthorized)", async () => {
    const uploader = makeUploaderDeps({
      uploadResult: { throw: new Error("Unauthorized") },
    });
    const deps = makeQueueDeps({ uploader });
    const q = createUploadQueue(deps);
    const id = q.enqueueUpload(makeImageInput());
    await q.whenIdle();

    const job = q.getJob(id);
    expect(job?.state).toBe("failed");
    expect(job?.lastError).toMatch(/Unauthorized/);
    expect(uploader.uploadProjectFile).toHaveBeenCalledTimes(1);
  });

  it("retryUpload moves a failed job back to pending and runs it", async () => {
    const uploader = makeUploaderDeps({
      uploadResults: [
        { throw: new Error("Forbidden") }, // terminal — won't auto-retry
      ],
    });
    const deps = makeQueueDeps({ uploader });
    const q = createUploadQueue(deps);
    const id = q.enqueueUpload(makeImageInput());
    await q.whenIdle();
    expect(q.getJob(id)?.state).toBe("failed");

    // Now make the next call succeed.
    (uploader.uploadProjectFile as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      metadata: makeRow({ id: "row-retry" }),
      storagePath: "p/r.jpg",
    });
    q.retryUpload(id);
    await q.whenIdle();

    const job = q.getJob(id);
    expect(job?.state).toBe("uploaded");
    expect(job?.fileId).toBe("row-retry");
  });

  it("cancelUpload on a pending job prevents the upload from running", async () => {
    // Block the worker on the first job so the second sits pending.
    let release!: () => void;
    const blocker = new Promise<void>((r) => {
      release = r;
    });
    const uploader = makeUploaderDeps();
    (uploader.uploadProjectFile as ReturnType<typeof vi.fn>).mockImplementationOnce(
      async () => {
        await blocker;
        return { metadata: makeRow({ id: "row-a" }), storagePath: "a" };
      },
    );

    const deps = makeQueueDeps({ uploader });
    const q = createUploadQueue(deps);
    q.enqueueUpload(makeImageInput());
    const idB = q.enqueueUpload(makeImageInput());

    // Cancel B before the worker gets to it.
    q.cancelUpload(idB);
    expect(q.getJob(idB)?.state).toBe("cancelled");

    release();
    await q.whenIdle();

    expect(uploader.uploadProjectFile).toHaveBeenCalledTimes(1);
    expect(q.getJob(idB)?.state).toBe("cancelled");
  });

  it("persists pending/failed jobs to AsyncStorage; drops uploaded/cancelled", async () => {
    const storage = memoryStorage();
    const uploader = makeUploaderDeps({
      uploadResults: [
        { throw: new Error("Unauthorized") },
        {
          metadataRow: makeRow({ id: "row-ok" }),
          storagePath: "proj-1/images/ok.jpg",
        },
      ],
    });
    const deps = makeQueueDeps({ storage, uploader });
    const q = createUploadQueue(deps);
    q.enqueueUpload(makeImageInput());
    q.enqueueUpload(makeImageInput());
    await q.whenIdle();

    // Allow the debounced persist (0ms) to flush.
    await new Promise((r) => setTimeout(r, 5));

    const raw = storage.data.get(QUEUE_STORAGE_KEY);
    expect(raw).toBeDefined();
    const parsed = JSON.parse(raw!);
    // Only the failed job is persisted; the uploaded one is dropped.
    expect(parsed).toHaveLength(1);
    expect(parsed[0].state).toBe("failed");
  });

  it("hydrate restores persisted failed jobs and verifies source URIs", async () => {
    const persisted = [
      {
        id: "old-job-1",
        state: "failed",
        attempts: 2,
        lastError: "boom",
        createdAt: 1,
        updatedAt: 2,
        input: makeImageInput({ sourceUri: "file:///still/here.jpg" }),
      },
      {
        id: "old-job-2",
        state: "failed",
        attempts: 1,
        lastError: "boom",
        createdAt: 1,
        updatedAt: 2,
        input: makeImageInput({ sourceUri: "file:///gone.jpg" }),
      },
    ];
    const storage = memoryStorage({
      [QUEUE_STORAGE_KEY]: JSON.stringify(persisted),
    });
    const fileExists = vi.fn(async (uri: string) =>
      uri === "file:///still/here.jpg",
    );

    const deps = makeQueueDeps({ storage, fileExists });
    const q = createUploadQueue(deps);
    await q.hydrate();

    const j1 = q.getJob("old-job-1");
    const j2 = q.getJob("old-job-2");
    expect(j1?.state).toBe("failed");
    expect(j1?.lastError).toBe("boom");
    expect(j2?.state).toBe("failed");
    expect(j2?.lastError).toMatch(/no longer exists/);
  });

  it("hydrate snaps in-flight states (preprocessing/uploading) back to pending", async () => {
    const persisted = [
      {
        id: "ghost-running",
        state: "uploading",
        attempts: 0,
        createdAt: 1,
        updatedAt: 2,
        input: makeImageInput(),
      },
    ];
    const storage = memoryStorage({
      [QUEUE_STORAGE_KEY]: JSON.stringify(persisted),
    });
    // Don't let the worker actually run — we want to inspect post-hydrate state.
    const uploader = makeUploaderDeps();
    let release!: () => void;
    const block = new Promise<void>((r) => {
      release = r;
    });
    (uploader.uploadProjectFile as ReturnType<typeof vi.fn>).mockImplementation(
      async () => {
        await block;
        return { metadata: makeRow(), storagePath: "p" };
      },
    );

    const q = createUploadQueue(makeQueueDeps({ storage, uploader }));
    await q.hydrate();
    // Job was 'uploading' when persisted but hydrates to 'pending' (then
    // the worker may have promoted it to preprocessing/uploading already
    // — both are acceptable, just NOT 'uploaded' or stuck on stale state).
    const state = q.getJob("ghost-running")?.state;
    expect(["pending", "preprocessing", "uploading"]).toContain(state);

    release();
    await q.whenIdle();
    expect(q.getJob("ghost-running")?.state).toBe("uploaded");
  });
});
