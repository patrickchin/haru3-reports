import { describe, expect, it, vi } from "vitest";
import {
  uploadProjectFileViaBackground,
  type BackgroundUploadDeps,
  type BackgroundUploadParams,
} from "./ios-background-upload";
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
    blurhash: null,
    deleted_at: null,
    created_at: "2026-05-08T00:00:00Z",
    updated_at: "2026-05-08T00:00:00Z",
    ...overrides,
  };
}

interface BackendOpts {
  signedUrl?: { signedUrl: string; token: string; path: string } | null;
  signedUrlError?: { message: string } | null;
  thumbUploadError?: { message: string } | null;
  insertResult?: { data: FileMetadataRow | null; error: { message: string } | null };
}

function makeBackend(opts: BackendOpts = {}): {
  backend: BackendLike;
  createSignedUploadUrl: ReturnType<typeof vi.fn>;
  bucketUpload: ReturnType<typeof vi.fn>;
  bucketRemove: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
} {
  const createSignedUploadUrl = vi.fn().mockResolvedValue({
    data:
      opts.signedUrl ??
      (opts.signedUrlError
        ? null
        : {
            signedUrl: "https://supabase.example/upload?token=abc",
            token: "abc",
            path: "proj-1/images/uuid-1.jpg",
          }),
    error: opts.signedUrlError ?? null,
  });
  const bucketUpload = vi.fn().mockResolvedValue({
    data: opts.thumbUploadError ? null : { path: "thumb-path" },
    error: opts.thumbUploadError ?? null,
  });
  const bucketRemove = vi.fn().mockResolvedValue({ data: null, error: null });

  const insert = vi.fn(() => ({
    select: () => ({
      single: () =>
        Promise.resolve(
          opts.insertResult ?? { data: makeRow(), error: null },
        ),
    }),
  }));

  const backend = {
    storage: {
      from: () => ({
        createSignedUploadUrl,
        upload: bucketUpload,
        remove: bucketRemove,
        createSignedUrl: () => Promise.resolve({ data: null, error: null }),
        getPublicUrl: () => ({ data: { publicUrl: "" } }),
      }),
    },
    from: () => ({ insert }),
    rpc: () => Promise.resolve({ data: null, error: null }),
  } as unknown as BackendLike;

  return { backend, createSignedUploadUrl, bucketUpload, bucketRemove, insert };
}

function makeBlob(size: number): Blob {
  return new Blob([new Uint8Array(size)], { type: "image/jpeg" });
}

function makeParams(
  backend: BackendLike,
  overrides: Partial<BackgroundUploadParams> = {},
): BackgroundUploadParams {
  return {
    backend,
    projectId: "proj-1",
    uploadedBy: "mike",
    category: "image",
    fileUri: "file:///tmp/photo.jpg",
    filename: "photo.jpg",
    mimeType: "image/jpeg",
    sizeBytes: 4096,
    width: 2048,
    height: 1536,
    blurhash: null,
    durationMs: null,
    thumbnail: { body: makeBlob(800), mimeType: "image/jpeg", sizeBytes: 800 },
    uuid: () => "uuid-1",
    ...overrides,
  };
}

function makeDeps(): BackgroundUploadDeps & {
  uploadViaBackgroundSession: ReturnType<typeof vi.fn>;
} {
  const uploadViaBackgroundSession = vi.fn().mockResolvedValue(undefined);
  return { uploadViaBackgroundSession };
}

// ---------- tests ----------

describe("uploadProjectFileViaBackground", () => {
  it("mints a signed URL, uploads via NSURLSession, then inserts metadata", async () => {
    const { backend, createSignedUploadUrl, bucketUpload, insert } = makeBackend();
    const deps = makeDeps();

    const out = await uploadProjectFileViaBackground(makeParams(backend), deps);

    expect(createSignedUploadUrl).toHaveBeenCalledWith(
      "proj-1/images/uuid-1.jpg",
    );
    expect(deps.uploadViaBackgroundSession).toHaveBeenCalledTimes(1);
    const bgArgs = deps.uploadViaBackgroundSession.mock.calls[0]?.[0];
    expect(bgArgs.signedUrl).toBe("https://supabase.example/upload?token=abc");
    expect(bgArgs.fileUri).toBe("file:///tmp/photo.jpg");
    expect(bgArgs.mimeType).toBe("image/jpeg");

    // Thumbnail uploaded foreground.
    expect(bucketUpload).toHaveBeenCalledTimes(1);
    expect(bucketUpload.mock.calls[0]?.[0]).toBe(
      "proj-1/images/uuid-1.jpg.thumb.jpg",
    );

    // file_metadata.insert ran with thumbnail_path set.
    expect(insert).toHaveBeenCalledTimes(1);
    const inserted = insert.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(inserted.storage_path).toBe("proj-1/images/uuid-1.jpg");
    expect(inserted.thumbnail_path).toBe("proj-1/images/uuid-1.jpg.thumb.jpg");

    expect(out.storagePath).toBe("proj-1/images/uuid-1.jpg");
    expect(out.metadata.id).toBe("row-1");
  });

  it("propagates a signed-URL error before touching NSURLSession", async () => {
    const { backend } = makeBackend({
      signedUrlError: { message: "bucket not found" },
    });
    const deps = makeDeps();

    await expect(
      uploadProjectFileViaBackground(makeParams(backend), deps),
    ).rejects.toThrow(/Signed upload URL failed.*bucket not found/);
    expect(deps.uploadViaBackgroundSession).not.toHaveBeenCalled();
  });

  it("wraps a background-session error and skips file_metadata.insert", async () => {
    const { backend, insert } = makeBackend();
    const deps = makeDeps();
    deps.uploadViaBackgroundSession.mockRejectedValueOnce(
      new Error("HTTP 503: gateway"),
    );

    await expect(
      uploadProjectFileViaBackground(makeParams(backend), deps),
    ).rejects.toThrow(/Background upload failed.*503/);
    expect(insert).not.toHaveBeenCalled();
  });

  it("rolls back the storage object when file_metadata insert fails", async () => {
    const { backend, bucketRemove } = makeBackend({
      insertResult: {
        data: null,
        error: { message: "policy violation" },
      },
    });
    const deps = makeDeps();

    await expect(
      uploadProjectFileViaBackground(makeParams(backend), deps),
    ).rejects.toThrow(/file_metadata insert failed.*policy violation/);
    // Removes both the main object and the thumbnail.
    expect(bucketRemove).toHaveBeenCalledTimes(1);
    expect(bucketRemove.mock.calls[0]?.[0]).toEqual([
      "proj-1/images/uuid-1.jpg",
      "proj-1/images/uuid-1.jpg.thumb.jpg",
    ]);
  });

  it("treats a thumbnail upload failure as best-effort (thumbnail_path = null)", async () => {
    const { backend, insert } = makeBackend({
      thumbUploadError: { message: "thumb bucket transient" },
    });
    const deps = makeDeps();

    const out = await uploadProjectFileViaBackground(makeParams(backend), deps);

    const inserted = insert.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(inserted.thumbnail_path).toBeNull();
    expect(out.storagePath).toBe("proj-1/images/uuid-1.jpg");
  });

  it("works for documents (no thumbnail) and uses the documents folder", async () => {
    const { backend, bucketUpload, insert } = makeBackend();
    const deps = makeDeps();

    const out = await uploadProjectFileViaBackground(
      makeParams(backend, {
        category: "document",
        filename: "spec.pdf",
        mimeType: "application/pdf",
        sizeBytes: 50_000,
        thumbnail: null,
        width: null,
        height: null,
      }),
      deps,
    );

    expect(out.storagePath).toBe("proj-1/documents/uuid-1.pdf");
    // No thumbnail upload should have happened.
    expect(bucketUpload).not.toHaveBeenCalled();
    const inserted = insert.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(inserted.thumbnail_path).toBeNull();
    expect(inserted.category).toBe("document");
  });

  it("rejects files that fail validation before any network call", async () => {
    const { backend, createSignedUploadUrl } = makeBackend();
    const deps = makeDeps();
    // Voice notes have a strict mime check; pdf fails it.
    await expect(
      uploadProjectFileViaBackground(
        makeParams(backend, {
          category: "voice-note",
          mimeType: "application/pdf",
          filename: "junk.pdf",
        }),
        deps,
      ),
    ).rejects.toThrow();
    expect(createSignedUploadUrl).not.toHaveBeenCalled();
    expect(deps.uploadViaBackgroundSession).not.toHaveBeenCalled();
  });
});
