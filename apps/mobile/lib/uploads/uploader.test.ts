import { describe, expect, it, vi } from "vitest";
import { runUploadJob, type UploaderDeps, type UploaderHandlers } from "./uploader";
import type { EnqueueInput } from "./jobs";
import type { BackendLike, FileMetadataRow } from "@/lib/file-upload";

// ---------- helpers ----------

function makeRow(overrides: Partial<FileMetadataRow> = {}): FileMetadataRow {
  return {
    id: "row-1",
    project_id: "proj-1",
    uploaded_by: "mike",
    bucket: "project-files",
    storage_path: "proj-1/images/uuid-1.jpg",
    category: "image",
    filename: "photo.jpg",
    mime_type: "image/jpeg",
    size_bytes: 4096,
    duration_ms: null,
    width: 2048,
    height: 1536,
    thumbnail_path: "proj-1/images/uuid-1.jpg.thumb.jpg",
    blurhash: "L6PZfSi_.AyE_3t7t7R**0o#DgR4",
    deleted_at: null,
    created_at: "2026-05-08T00:00:00Z",
    updated_at: "2026-05-08T00:00:00Z",
    ...overrides,
  };
}

function makeBlob(size: number): Blob {
  // Vitest/Node 20 has a global Blob implementation.
  return new Blob([new Uint8Array(size)], { type: "image/jpeg" });
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

function makeDocumentInput(overrides: Partial<EnqueueInput> = {}): EnqueueInput {
  return {
    kind: "document",
    sourceUri: "file:///tmp/spec.pdf",
    filename: "spec.pdf",
    mimeType: "application/pdf",
    sizeBytes: 50_000,
    projectId: "proj-1",
    reportId: null,
    uploadedBy: "mike",
    category: "document",
    isImage: false,
    ...overrides,
  };
}

function makeHandlers(): UploaderHandlers & {
  preprocessCalls: unknown[];
  uploadStartCalls: number;
} {
  const preprocessCalls: unknown[] = [];
  let uploadStartCalls = 0;
  return {
    preprocessCalls,
    get uploadStartCalls() {
      return uploadStartCalls;
    },
    onPreprocessComplete: (info) => {
      preprocessCalls.push(info);
    },
    onUploadStart: () => {
      uploadStartCalls += 1;
    },
  };
}

interface ReportNotesMockOpts {
  maxRow?: { position: number } | null;
  maxError?: { message: string } | null;
  insertError?: { message: string } | null;
}

function makeBackend(reportNotesOpts: ReportNotesMockOpts | null = null): {
  backend: BackendLike;
  reportNotesInsert: ReturnType<typeof vi.fn>;
  reportNotesSelect: ReturnType<typeof vi.fn>;
} {
  const reportNotesInsert = vi.fn().mockResolvedValue({
    error: reportNotesOpts?.insertError ?? null,
  });
  const maybeSingle = vi.fn().mockResolvedValue({
    data: reportNotesOpts?.maxRow ?? null,
    error: reportNotesOpts?.maxError ?? null,
  });
  // Chainable builder for select(...).eq(...).is(...).order(...).limit(...).maybeSingle()
  const chain: Record<string, unknown> = {
    eq: () => chain,
    is: () => chain,
    order: () => chain,
    limit: () => chain,
    maybeSingle,
  };
  const reportNotesSelect = vi.fn(() => chain);

  const reportNotesTable = {
    select: reportNotesSelect,
    insert: reportNotesInsert,
  };

  // The uploader only ever calls backend.from("report_notes") (via cast).
  const fromFn = vi.fn((_: string) => reportNotesTable);

  // The other backend surfaces (storage, rpc, file_metadata) are reached
  // through deps.uploadProjectFile / deps.deleteProjectFile, not directly,
  // so we don't have to model them faithfully here.
  const backend = {
    from: fromFn,
    storage: { from: () => ({}) },
    rpc: () => Promise.resolve({ data: null, error: null }),
  } as unknown as BackendLike;

  return { backend, reportNotesInsert, reportNotesSelect };
}

function makeDeps(opts: {
  backend: BackendLike;
  uploadResult?:
    | { metadata: FileMetadataRow; storagePath: string }
    | { throw: Error };
  preprocessOutcome?: {
    workingUri: string;
    thumbnailUri?: string;
    width?: number;
    height?: number;
    blurhash?: string | null;
  };
  mainBlobSize?: number;
  thumbBlobSize?: number;
}): UploaderDeps & {
  uploadProjectFile: ReturnType<typeof vi.fn>;
  deleteProjectFile: ReturnType<typeof vi.fn>;
  preprocessSpy: ReturnType<typeof vi.fn>;
  uriToBlobSpy: ReturnType<typeof vi.fn>;
} {
  const uploadProjectFile = vi.fn(async () => {
    if (opts.uploadResult && "throw" in opts.uploadResult) {
      throw opts.uploadResult.throw;
    }
    return (
      opts.uploadResult ?? {
        metadata: makeRow(),
        storagePath: "proj-1/images/uuid-1.jpg",
      }
    );
  });

  const deleteProjectFile = vi.fn(async () => undefined);

  const preprocessSpy = vi.fn(async () => ({
    originalUri: opts.preprocessOutcome?.workingUri ?? "file:///tmp/resized.jpg",
    thumbnailUri:
      opts.preprocessOutcome?.thumbnailUri ?? "file:///tmp/resized.thumb.jpg",
    width: opts.preprocessOutcome?.width ?? 2048,
    height: opts.preprocessOutcome?.height ?? 1536,
    mimeType: "image/jpeg" as const,
    blurhash: opts.preprocessOutcome?.blurhash ?? "abc",
  }));

  const uriToBlobSpy = vi.fn(async (uri: string) => {
    const isThumb = uri.includes(".thumb");
    return {
      blob: makeBlob(
        isThumb ? (opts.thumbBlobSize ?? 800) : (opts.mainBlobSize ?? 4096),
      ),
    };
  });

  return {
    backend: opts.backend,
    uriToBlob: uriToBlobSpy as unknown as UploaderDeps["uriToBlob"],
    preprocess: { preprocess: preprocessSpy as never },
    uploadProjectFile: uploadProjectFile as never,
    deleteProjectFile: deleteProjectFile as never,
    uuid: () => "uuid-1",
    preprocessSpy,
    uriToBlobSpy,
  } as never;
}

// ---------- tests ----------

describe("runUploadJob", () => {
  it("preprocesses, uploads main + thumb blobs, and returns the metadata row", async () => {
    const { backend } = makeBackend(null);
    const deps = makeDeps({ backend });
    const handlers = makeHandlers();

    const out = await runUploadJob(makeImageInput(), deps, handlers);

    expect(deps.preprocessSpy).toHaveBeenCalledTimes(1);
    expect(deps.uriToBlobSpy).toHaveBeenCalledTimes(2);
    expect(deps.uriToBlobSpy.mock.calls[0]?.[0]).toBe("file:///tmp/resized.jpg");
    expect(deps.uriToBlobSpy.mock.calls[1]?.[0]).toBe(
      "file:///tmp/resized.thumb.jpg",
    );

    expect(deps.uploadProjectFile).toHaveBeenCalledTimes(1);
    const params = (deps.uploadProjectFile as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0] as Record<string, unknown>;
    expect(params.projectId).toBe("proj-1");
    expect(params.uploadedBy).toBe("mike");
    expect(params.category).toBe("image");
    expect(params.width).toBe(2048);
    expect(params.height).toBe(1536);
    expect(params.blurhash).toBe("abc");
    expect((params.body as Blob).size).toBe(4096);
    expect((params.thumbnail as { body: Blob }).body.size).toBe(800);

    expect(handlers.preprocessCalls).toHaveLength(1);
    expect(handlers.uploadStartCalls).toBe(1);
    expect(out.storagePath).toBe("proj-1/images/uuid-1.jpg");
    expect(out.metadataRow.id).toBe("row-1");
  });

  it("skips preprocess for non-image jobs (workingUri = sourceUri, no thumb)", async () => {
    const { backend } = makeBackend(null);
    const deps = makeDeps({ backend });
    const handlers = makeHandlers();

    await runUploadJob(makeDocumentInput(), deps, handlers);

    expect(deps.preprocessSpy).not.toHaveBeenCalled();
    expect(deps.uriToBlobSpy).toHaveBeenCalledTimes(1);
    expect(deps.uriToBlobSpy.mock.calls[0]?.[0]).toBe("file:///tmp/spec.pdf");

    const params = (deps.uploadProjectFile as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0] as Record<string, unknown>;
    expect(params.thumbnail).toBeNull();
    expect(params.category).toBe("document");
  });

  it("rejects avatar kind (handled separately, not via the project queue)", async () => {
    const { backend } = makeBackend(null);
    const deps = makeDeps({ backend });
    const input = makeImageInput({
      kind: "avatar",
      isImage: true,
      category: "image",
    });
    await expect(runUploadJob(input, deps, makeHandlers())).rejects.toThrow(
      /avatar kind/,
    );
  });

  it("rejects project uploads missing projectId", async () => {
    const { backend } = makeBackend(null);
    const deps = makeDeps({ backend });
    const input = makeImageInput({ projectId: undefined });
    await expect(runUploadJob(input, deps, makeHandlers())).rejects.toThrow(
      /missing projectId/,
    );
  });

  it("links a report_notes row when reportId is set (image → kind=image, position=max+1)", async () => {
    const { backend, reportNotesInsert, reportNotesSelect } = makeBackend({
      maxRow: { position: 7 },
    });
    const deps = makeDeps({ backend });
    const input = makeImageInput({ reportId: "report-9" });

    await runUploadJob(input, deps, makeHandlers());

    expect(reportNotesSelect).toHaveBeenCalledWith("position");
    expect(reportNotesInsert).toHaveBeenCalledTimes(1);
    const inserted = reportNotesInsert.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(inserted.report_id).toBe("report-9");
    expect(inserted.project_id).toBe("proj-1");
    expect(inserted.author_id).toBe("mike");
    expect(inserted.kind).toBe("image");
    expect(inserted.position).toBe(8);
    expect(inserted.file_id).toBe("row-1");
    expect(deps.deleteProjectFile).not.toHaveBeenCalled();
  });

  it("uses position=1 when there are no existing notes", async () => {
    const { backend, reportNotesInsert } = makeBackend({ maxRow: null });
    const deps = makeDeps({ backend });
    await runUploadJob(
      makeDocumentInput({ reportId: "report-9" }),
      deps,
      makeHandlers(),
    );
    const inserted = reportNotesInsert.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(inserted.position).toBe(1);
    expect(inserted.kind).toBe("document");
  });

  it("rolls back the uploaded file when report_notes insert fails", async () => {
    const { backend, reportNotesInsert } = makeBackend({
      insertError: { message: "duplicate position" },
    });
    const deps = makeDeps({ backend });
    const input = makeImageInput({ reportId: "report-9" });

    await expect(runUploadJob(input, deps, makeHandlers())).rejects.toThrow(
      /duplicate position/,
    );

    expect(reportNotesInsert).toHaveBeenCalledTimes(1);
    expect(deps.deleteProjectFile).toHaveBeenCalledTimes(1);
    const args = (deps.deleteProjectFile as ReturnType<typeof vi.fn>).mock
      .calls[0];
    // (backend, fileId, storagePath, thumbnailPath)
    expect(args?.[1]).toBe("row-1");
    expect(args?.[2]).toBe("proj-1/images/uuid-1.jpg");
    expect(args?.[3]).toBe("proj-1/images/uuid-1.jpg.thumb.jpg");
  });

  it("does not link a report_notes row for voice-note category", async () => {
    const { backend, reportNotesInsert } = makeBackend(null);
    const deps = makeDeps({ backend });
    const input: EnqueueInput = {
      kind: "voice-note",
      sourceUri: "file:///tmp/note.m4a",
      filename: "note.m4a",
      mimeType: "audio/m4a",
      sizeBytes: 30_000,
      projectId: "proj-1",
      reportId: "report-9",
      uploadedBy: "mike",
      category: "voice-note",
      isImage: false,
      durationMs: 5_000,
    };
    await runUploadJob(input, deps, makeHandlers());
    expect(reportNotesInsert).not.toHaveBeenCalled();
  });

  it("propagates uploadProjectFile errors without touching report_notes", async () => {
    const { backend, reportNotesInsert } = makeBackend(null);
    const deps = makeDeps({
      backend,
      uploadResult: { throw: new Error("Storage upload failed: 503") },
    });
    await expect(
      runUploadJob(
        makeImageInput({ reportId: "report-9" }),
        deps,
        makeHandlers(),
      ),
    ).rejects.toThrow(/503/);
    expect(reportNotesInsert).not.toHaveBeenCalled();
    expect(deps.deleteProjectFile).not.toHaveBeenCalled();
  });

  it("routes through the iOS background path when both deps are provided", async () => {
    const { backend } = makeBackend(null);
    const deps = makeDeps({ backend });

    // Inject the background-path adapters. The thumbnail still goes
    // through uriToBlob (foreground), but the main file does NOT.
    const uploadProjectFileViaBackground = vi.fn(
      async (..._args: unknown[]) => ({
        metadata: makeRow(),
        storagePath: "proj-1/images/uuid-1.jpg",
      }),
    );
    const uploadViaBackgroundSession = vi.fn(async (..._args: unknown[]) => undefined);
    const bgDeps = {
      ...deps,
      uploadProjectFileViaBackground:
        uploadProjectFileViaBackground as never,
      uploadViaBackgroundSession: uploadViaBackgroundSession as never,
    };

    await runUploadJob(makeImageInput(), bgDeps, makeHandlers());

    // Foreground main upload was NOT called.
    expect(deps.uploadProjectFile).not.toHaveBeenCalled();
    expect(uploadProjectFileViaBackground).toHaveBeenCalledTimes(1);

    // Only the thumbnail URI was read as a Blob (main goes via fileUri).
    expect(deps.uriToBlobSpy).toHaveBeenCalledTimes(1);
    expect(deps.uriToBlobSpy.mock.calls[0]?.[0]).toBe(
      "file:///tmp/resized.thumb.jpg",
    );

    const params = uploadProjectFileViaBackground.mock.calls[0]?.[0] as unknown as Record<
      string,
      unknown
    >;
    expect(params.fileUri).toBe("file:///tmp/resized.jpg");
    expect(params.projectId).toBe("proj-1");
    expect((params.thumbnail as { body: Blob }).body.size).toBe(800);

    const passedDeps = uploadProjectFileViaBackground.mock
      .calls[0]?.[1] as unknown as Record<string, unknown>;
    expect(passedDeps.uploadViaBackgroundSession).toBe(
      uploadViaBackgroundSession,
    );
  });

  it("falls back to foreground when only uploadViaBackgroundSession is provided", async () => {
    const { backend } = makeBackend(null);
    const deps = makeDeps({ backend });
    const uploadViaBackgroundSession = vi.fn();
    const partialDeps = {
      ...deps,
      uploadViaBackgroundSession: uploadViaBackgroundSession as never,
      // uploadProjectFileViaBackground intentionally undefined
    };

    await runUploadJob(makeImageInput(), partialDeps, makeHandlers());

    expect(uploadViaBackgroundSession).not.toHaveBeenCalled();
    expect(deps.uploadProjectFile).toHaveBeenCalledTimes(1);
  });
});
