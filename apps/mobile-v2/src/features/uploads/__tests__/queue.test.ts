/**
 * Unit tests for the upload queue runtime.
 *
 * Mocks AsyncStorage and uploader deps for deterministic testing.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createUploadQueue, type StorageLike } from "../queue";
import type { UploaderDeps, UploaderResult } from "../uploader";
import type { EnqueueInput } from "../jobs";

describe("createUploadQueue", () => {
  let storage: StorageLike;
  let uploader: UploaderDeps;
  let now: () => number;
  let currentTime: number;

  beforeEach(() => {
    currentTime = 1000;
    now = () => currentTime;

    const storageMap = new Map<string, string>();
    storage = {
      getItem: async (key) => storageMap.get(key) ?? null,
      setItem: async (key, value) => {
        storageMap.set(key, value);
      },
      removeItem: async (key) => {
        storageMap.delete(key);
      },
    };

    uploader = {
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
        voice_transcript: null,
        voice_summary: null,
        voice_duration_ms: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        deleted_at: null,
      })),
    };
  });

  it("enqueues an upload and runs it", async () => {
    const queue = createUploadQueue({
      storage,
      uploader,
      now,
      uuid: () => "job-1",
      persistDebounceMs: 0,
    });

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

    const jobId = queue.enqueueUpload(input);
    expect(jobId).toBe("job-1");

    await queue.whenIdle();

    const job = queue.getJob(jobId);
    expect(job?.state).toBe("uploaded");
    expect(job?.fileId).toBe("file-1");
  });

  it("retries a failed job", async () => {
    uploader.uploadToStorage = vi
      .fn()
      .mockRejectedValueOnce(new Error("Network error"))
      .mockResolvedValueOnce("proj-1/images/file-1.jpg");

    const queue = createUploadQueue({
      storage,
      uploader,
      now,
      uuid: () => "job-1",
      persistDebounceMs: 0,
    });

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

    const jobId = queue.enqueueUpload(input);
    await queue.whenIdle();

    let job = queue.getJob(jobId);
    expect(job?.state).toBe("failed");
    expect(job?.lastError).toContain("Network error");

    queue.retryUpload(jobId);
    await queue.whenIdle();

    job = queue.getJob(jobId);
    expect(job?.state).toBe("uploaded");
  });

  it("cancels an upload", async () => {
    const queue = createUploadQueue({
      storage,
      uploader,
      now,
      uuid: () => "job-1",
      persistDebounceMs: 0,
    });

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

    const jobId = queue.enqueueUpload(input);
    queue.cancelUpload(jobId);

    const job = queue.getJob(jobId);
    expect(job?.state).toBe("cancelled");
  });

  it("persists and hydrates jobs", async () => {
    const queue = createUploadQueue({
      storage,
      uploader,
      now,
      uuid: () => "job-1",
      persistDebounceMs: 0,
    });

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

    queue.enqueueUpload(input);
    await new Promise((r) => setTimeout(r, 10)); // let persist happen

    const queue2 = createUploadQueue({
      storage,
      uploader,
      now,
      uuid: () => "job-2",
      persistDebounceMs: 0,
    });

    await queue2.hydrate();
    const jobs = queue2.getJobs();
    expect(jobs.length).toBeGreaterThan(0);
    expect(jobs[0].id).toBe("job-1");
  });
});
