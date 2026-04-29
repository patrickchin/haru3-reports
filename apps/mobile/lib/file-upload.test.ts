import { describe, it, expect, vi } from "vitest";
import {
  AVATARS_BUCKET,
  PROJECT_FILES_BUCKET,
  deleteProjectFile,
  getSignedUrl,
  uploadAvatar,
  uploadProjectFile,
  type BackendLike,
  type FileMetadataRow,
} from "./file-upload";

// ---------- helpers ----------

function makeRow(overrides: Partial<FileMetadataRow> = {}): FileMetadataRow {
  return {
    id: "row-1",
    project_id: "proj-1",
    uploaded_by: "mike",
    bucket: "project-files",
    storage_path: "proj-1/documents/uuid-1.pdf",
    category: "document",
    filename: "x.pdf",
    mime_type: "application/pdf",
    size_bytes: 1024,
    duration_ms: null,
    deleted_at: null,
    created_at: "2026-04-27T00:00:00Z",
    updated_at: "2026-04-27T00:00:00Z",
    ...overrides,
  };
}

function makeBackend(opts: {
  uploadResult?: { data: { path: string } | null; error: { message: string } | null };
  insertResult?: { data: FileMetadataRow | null; error: { message: string } | null };
  removeResult?: { data: unknown; error: { message: string } | null };
  signedUrlResult?: {
    data: { signedUrl: string } | null;
    error: { message: string } | null;
  };
  publicUrl?: string;
  metaDeleteResult?: { data: null; error: { message: string } | null };
  metaUpdateResult?: { data: FileMetadataRow | null; error: { message: string } | null };
} = {}) {
  const upload = vi.fn().mockResolvedValue(
    opts.uploadResult ?? { data: { path: "ok" }, error: null },
  );
  const remove = vi.fn().mockResolvedValue(
    opts.removeResult ?? { data: [{}], error: null },
  );
  const createSignedUrl = vi.fn().mockResolvedValue(
    opts.signedUrlResult ?? {
      data: { signedUrl: "https://signed.example/abc" },
      error: null,
    },
  );
  const getPublicUrl = vi.fn(() => ({
    data: { publicUrl: opts.publicUrl ?? "https://public.example/avatar.png" },
  }));

  const insertSingle = vi.fn().mockResolvedValue(
    opts.insertResult ?? { data: makeRow(), error: null },
  );
  const insertSelect = vi.fn(() => ({ single: insertSingle }));
  const insert = vi.fn(() => ({ select: insertSelect }));

  const updateSingle = vi.fn().mockResolvedValue(
    opts.metaUpdateResult ?? { data: makeRow({ transcription: "hello" }), error: null },
  );
  const updateSelect = vi.fn(() => ({ single: updateSingle }));
  const updateEq = vi.fn(() => ({ select: updateSelect }));
  const update = vi.fn(() => ({ eq: updateEq }));

  const deleteEq = vi.fn().mockResolvedValue(
    opts.metaDeleteResult ?? { data: null, error: null },
  );
  const deleteFn = vi.fn(() => ({ eq: deleteEq }));

  const bucketObj = { upload, remove, createSignedUrl, getPublicUrl };
  const storageFrom = vi.fn(() => bucketObj);

  const tableFrom = vi.fn(() => ({
    insert,
    update,
    delete: deleteFn,
  }));

  const backend: BackendLike = {
    storage: { from: storageFrom },
    from: tableFrom,
  };

  return {
    backend,
    upload,
    remove,
    createSignedUrl,
    getPublicUrl,
    storageFrom,
    tableFrom,
    insert,
    insertSelect,
    insertSingle,
    update,
    updateEq,
    updateSelect,
    updateSingle,
    deleteFn,
    deleteEq,
  };
}

// ---------- uploadProjectFile ----------

describe("uploadProjectFile", () => {
  it("uploads bytes, inserts metadata, and returns combined result", async () => {
    const m = makeBackend();
    const body = new Uint8Array([1, 2, 3]);

    const out = await uploadProjectFile({
      backend: m.backend,
      projectId: "proj-1",
      uploadedBy: "mike",
      category: "document",
      body,
      filename: "report.pdf",
      mimeType: "application/pdf",
      sizeBytes: 3,
      uuid: () => "uuid-1",
    });

    expect(m.storageFrom).toHaveBeenCalledWith(PROJECT_FILES_BUCKET);
    expect(m.upload).toHaveBeenCalledWith(
      "proj-1/documents/uuid-1.pdf",
      body,
      { contentType: "application/pdf", upsert: false },
    );
    expect(m.tableFrom).toHaveBeenCalledWith("file_metadata");
    expect(m.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        project_id: "proj-1",
        uploaded_by: "mike",
        category: "document",
        storage_path: "proj-1/documents/uuid-1.pdf",
        filename: "report.pdf",
        mime_type: "application/pdf",
        size_bytes: 3,
        duration_ms: null,
      }),
    );
    expect(out.metadata.id).toBe("row-1");
    expect(out.storagePath).toBe("proj-1/documents/uuid-1.pdf");
  });

  it("uses voice-notes/ folder and m4a extension for voice-note category", async () => {
    const m = makeBackend();

    await uploadProjectFile({
      backend: m.backend,
      projectId: "proj-1",
      uploadedBy: "mike",
      category: "voice-note",
      body: new Uint8Array([1]),
      filename: "rec.m4a",
      mimeType: "audio/m4a",
      sizeBytes: 1,
      durationMs: 4200,
      uuid: () => "uuid-2",
    });

    expect(m.upload).toHaveBeenCalledWith(
      "proj-1/voice-notes/uuid-2.m4a",
      expect.anything(),
      expect.objectContaining({ contentType: "audio/m4a" }),
    );
    expect(m.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "voice-note",
        duration_ms: 4200,
      }),
    );
  });

  it("rejects validation failures before touching storage", async () => {
    const m = makeBackend();

    await expect(
      uploadProjectFile({
        backend: m.backend,
        projectId: "proj-1",
        uploadedBy: "mike",
        category: "image",
        body: new Uint8Array([1]),
        filename: "movie.mov",
        mimeType: "video/quicktime", // not in image allow-list
        sizeBytes: 1,
      }),
    ).rejects.toThrow(/Unsupported file type/);

    expect(m.upload).not.toHaveBeenCalled();
    expect(m.insert).not.toHaveBeenCalled();
  });

  it("throws and does not insert when storage upload fails", async () => {
    const m = makeBackend({
      uploadResult: { data: null, error: { message: "boom" } },
    });

    await expect(
      uploadProjectFile({
        backend: m.backend,
        projectId: "proj-1",
        uploadedBy: "mike",
        category: "document",
        body: new Uint8Array([1]),
        filename: "x.pdf",
        mimeType: "application/pdf",
        sizeBytes: 1,
        uuid: () => "uuid-3",
      }),
    ).rejects.toThrow(/boom/);

    expect(m.insert).not.toHaveBeenCalled();
  });

  it("rolls back the storage object when metadata insert fails", async () => {
    const m = makeBackend({
      insertResult: { data: null, error: { message: "RLS denied" } },
    });

    await expect(
      uploadProjectFile({
        backend: m.backend,
        projectId: "proj-1",
        uploadedBy: "mike",
        category: "document",
        body: new Uint8Array([1]),
        filename: "x.pdf",
        mimeType: "application/pdf",
        sizeBytes: 1,
        uuid: () => "uuid-4",
      }),
    ).rejects.toThrow(/RLS denied/);

    expect(m.remove).toHaveBeenCalledWith(["proj-1/documents/uuid-4.pdf"]);
  });

  it("swallows rollback errors so the user sees the original failure", async () => {
    const m = makeBackend({
      insertResult: { data: null, error: { message: "RLS denied" } },
      removeResult: { data: null, error: { message: "rollback also failed" } },
    });

    await expect(
      uploadProjectFile({
        backend: m.backend,
        projectId: "proj-1",
        uploadedBy: "mike",
        category: "document",
        body: new Uint8Array([1]),
        filename: "x.pdf",
        mimeType: "application/pdf",
        sizeBytes: 1,
        uuid: () => "uuid-5",
      }),
    ).rejects.toThrow(/RLS denied/);
  });
});

// ---------- uploadAvatar ----------

describe("uploadAvatar", () => {
  it("uploads to {userId}/{uuid}.ext in the avatars bucket and returns publicUrl", async () => {
    const m = makeBackend({ publicUrl: "https://public.example/u/avatar.png" });

    const out = await uploadAvatar({
      backend: m.backend,
      userId: "user-1",
      body: new Uint8Array([1]),
      filename: "me.png",
      mimeType: "image/png",
      sizeBytes: 100,
      uuid: () => "uuid-a",
    });

    expect(m.storageFrom).toHaveBeenCalledWith(AVATARS_BUCKET);
    expect(m.upload).toHaveBeenCalledWith(
      "user-1/uuid-a.png",
      expect.anything(),
      expect.objectContaining({ upsert: true }),
    );
    expect(out.publicUrl).toBe("https://public.example/u/avatar.png");
  });

  it("rejects non-image avatar uploads", async () => {
    const m = makeBackend();
    await expect(
      uploadAvatar({
        backend: m.backend,
        userId: "user-1",
        body: new Uint8Array([1]),
        filename: "me.pdf",
        mimeType: "application/pdf",
        sizeBytes: 100,
      }),
    ).rejects.toThrow(/Unsupported/);
    expect(m.upload).not.toHaveBeenCalled();
  });
});

// ---------- getSignedUrl ----------

describe("getSignedUrl", () => {
  it("returns the signed URL on success", async () => {
    const m = makeBackend({
      signedUrlResult: {
        data: { signedUrl: "https://signed.example/file" },
        error: null,
      },
    });
    const url = await getSignedUrl(m.backend, "proj-1/documents/x.pdf", 60);
    expect(url).toBe("https://signed.example/file");
    expect(m.createSignedUrl).toHaveBeenCalledWith(
      "proj-1/documents/x.pdf",
      60,
    );
  });

  it("throws when signing fails", async () => {
    const m = makeBackend({
      signedUrlResult: { data: null, error: { message: "no perms" } },
    });
    await expect(
      getSignedUrl(m.backend, "proj-1/documents/x.pdf"),
    ).rejects.toThrow(/no perms/);
  });
});

// ---------- deleteProjectFile ----------

describe("deleteProjectFile", () => {
  it("deletes metadata then storage object", async () => {
    const m = makeBackend();
    await deleteProjectFile(m.backend, "row-1", "proj-1/documents/x.pdf");
    expect(m.deleteFn).toHaveBeenCalled();
    expect(m.deleteEq).toHaveBeenCalledWith("id", "row-1");
    expect(m.remove).toHaveBeenCalledWith(["proj-1/documents/x.pdf"]);
  });

  it("does not call storage.remove when metadata delete fails", async () => {
    const m = makeBackend({
      metaDeleteResult: { data: null, error: { message: "denied" } },
    });
    await expect(
      deleteProjectFile(m.backend, "row-1", "proj-1/documents/x.pdf"),
    ).rejects.toThrow(/denied/);
    expect(m.remove).not.toHaveBeenCalled();
  });

  it("propagates storage remove errors", async () => {
    const m = makeBackend({
      removeResult: { data: null, error: { message: "storage gone" } },
    });
    await expect(
      deleteProjectFile(m.backend, "row-1", "proj-1/documents/x.pdf"),
    ).rejects.toThrow(/storage gone/);
  });
});
