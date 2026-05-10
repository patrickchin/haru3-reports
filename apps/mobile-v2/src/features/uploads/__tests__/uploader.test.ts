/**
 * Unit tests for the uploader.
 *
 * Mocks Supabase storage; does NOT mock the Blob/fetch primitive
 * (standard-path-first rule).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { runUploadJob, type UploaderDeps } from "../uploader";
import type { EnqueueInput } from "../jobs";

describe("runUploadJob", () => {
  let deps: UploaderDeps;

  beforeEach(() => {
    deps = {
      preprocessImage: vi.fn(async (uri) => ({
        workingUri: uri,
        thumbnailUri: undefined,
        width: 2048,
        height: 1536,
        blurhash: null,
      })),
      uriToBlob: vi.fn(async () => new Uint8Array(100)),
      uploadToStorage: vi.fn(async () => "proj-1/images/file-1.jpg"),
      insertFileMetadata: vi.fn(async () => ({
        id: "file-1",
        project_id: "proj-1",
        uploader_id: "user-1",
        file_name: "photo.jpg",
        file_size: 100,
        mime_type: "image/jpeg",
        storage_path: "proj-1/images/file-1.jpg",
        thumbnail_url: null,
        voice_title: null,
        voice_summary: null,
        voice_duration_ms: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        deleted_at: null,
      })),
    };
  });

  it("uploads a photo end-to-end", async () => {
    const input: EnqueueInput = {
      kind: "photo",
      sourceUri: "file:///tmp/photo.jpg",
      filename: "photo.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 100_000,
      projectId: "proj-1",
      uploadedBy: "user-1",
      isImage: true,
    };

    const handlers = {
      onPreprocessComplete: vi.fn(),
      onUploadStart: vi.fn(),
      onProgress: vi.fn(),
    };

    const result = await runUploadJob(input, deps, handlers);

    expect(handlers.onPreprocessComplete).toHaveBeenCalledWith(
      expect.objectContaining({ workingUri: "file:///tmp/photo.jpg" }),
    );
    expect(handlers.onUploadStart).toHaveBeenCalled();
    expect(result.metadataRow.id).toBe("file-1");
    expect(result.storagePath).toBe("proj-1/images/file-1.jpg");
  });

  it("throws on missing projectId", async () => {
    const input: EnqueueInput = {
      kind: "photo",
      sourceUri: "file:///tmp/photo.jpg",
      filename: "photo.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 100_000,
      uploadedBy: "user-1",
      isImage: true,
    };

    const handlers = {
      onPreprocessComplete: vi.fn(),
      onUploadStart: vi.fn(),
    };

    await expect(runUploadJob(input, deps, handlers)).rejects.toThrow(
      /missing projectId/,
    );
  });

  it("uploads a document without preprocessing", async () => {
    const input: EnqueueInput = {
      kind: "document",
      sourceUri: "file:///tmp/doc.pdf",
      filename: "doc.pdf",
      mimeType: "application/pdf",
      sizeBytes: 50_000,
      projectId: "proj-1",
      uploadedBy: "user-1",
      isImage: false,
    };

    const handlers = {
      onPreprocessComplete: vi.fn(),
      onUploadStart: vi.fn(),
    };

    const result = await runUploadJob(input, deps, handlers);

    expect(deps.preprocessImage).not.toHaveBeenCalled();
    expect(handlers.onPreprocessComplete).toHaveBeenCalledWith(
      expect.objectContaining({
        workingUri: "file:///tmp/doc.pdf",
        thumbnailUri: undefined,
        blurhash: null,
      }),
    );
    expect(result.metadataRow.id).toBe("file-1");
  });
});
