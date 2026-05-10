/**
 * Unit tests for the pure jobs reducer.
 *
 * FULL coverage — pure functions, no mocks needed.
 */
import { describe, it, expect } from "vitest";
import {
  createJob,
  reduce,
  isTerminal,
  shouldAutoRetry,
  backoffMs,
  toPersisted,
  fromPersisted,
  type EnqueueInput,
  type UploadJob,
  type JobEvent,
} from "../jobs";

const mockInput: EnqueueInput = {
  kind: "photo",
  sourceUri: "file:///tmp/photo.jpg",
  filename: "photo.jpg",
  mimeType: "image/jpeg",
  sizeBytes: 100_000,
  projectId: "proj-1",
  uploadedBy: "user-1",
  isImage: true,
};

describe("createJob", () => {
  it("creates a pending job", () => {
    const job = createJob("job-1", mockInput, 1000);
    expect(job.id).toBe("job-1");
    expect(job.state).toBe("pending");
    expect(job.attempts).toBe(0);
    expect(job.progress).toBe(0);
    expect(job.createdAt).toBe(1000);
    expect(job.updatedAt).toBe(1000);
    expect(job.input).toBe(mockInput);
  });
});

describe("reduce", () => {
  it("transitions pending → preprocessing", () => {
    const job = createJob("job-1", mockInput, 1000);
    const next = reduce(job, { type: "start-preprocess" }, 2000);
    expect(next.state).toBe("preprocessing");
    expect(next.updatedAt).toBe(2000);
    expect(next.lastError).toBeUndefined();
  });

  it("transitions preprocessing → uploading", () => {
    let job = createJob("job-1", mockInput, 1000);
    job = reduce(job, { type: "start-preprocess" }, 1100);
    job = reduce(
      job,
      {
        type: "preprocess-complete",
        workingUri: "file:///cache/working.jpg",
        thumbnailUri: "file:///cache/thumb.jpg",
        width: 2048,
        height: 1536,
        blurhash: "LEHV6nWB2yk8pyo0adR*.7kCMdnj",
      },
      1200,
    );
    const next = reduce(job, { type: "start-upload" }, 1300);
    expect(next.state).toBe("uploading");
    expect(next.progress).toBe(0);
  });

  it("updates progress during uploading", () => {
    let job = createJob("job-1", mockInput, 1000);
    job = reduce(job, { type: "start-preprocess" }, 1100);
    job = reduce(
      job,
      { type: "preprocess-complete", workingUri: "file:///cache/working.jpg" },
      1200,
    );
    job = reduce(job, { type: "start-upload" }, 1300);
    const next = reduce(job, { type: "progress", progress: 0.5 }, 1400);
    expect(next.state).toBe("uploading");
    expect(next.progress).toBe(0.5);
  });

  it("transitions uploading → uploaded", () => {
    let job = createJob("job-1", mockInput, 1000);
    job = reduce(job, { type: "start-preprocess" }, 1100);
    job = reduce(
      job,
      { type: "preprocess-complete", workingUri: "file:///cache/working.jpg" },
      1200,
    );
    job = reduce(job, { type: "start-upload" }, 1300);
    const next = reduce(
      job,
      {
        type: "upload-complete",
        fileId: "file-1",
        storagePath: "proj-1/images/file-1.jpg",
        metadataRow: {} as any,
      },
      1400,
    );
    expect(next.state).toBe("uploaded");
    expect(next.progress).toBe(1);
    expect(next.fileId).toBe("file-1");
    expect(next.storagePath).toBe("proj-1/images/file-1.jpg");
  });

  it("transitions to failed and increments attempts", () => {
    let job = createJob("job-1", mockInput, 1000);
    job = reduce(job, { type: "start-preprocess" }, 1100);
    const next = reduce(job, { type: "fail", error: "Network error" }, 1200);
    expect(next.state).toBe("failed");
    expect(next.attempts).toBe(1);
    expect(next.lastError).toBe("Network error");
  });

  it("transitions failed → pending on retry", () => {
    let job = createJob("job-1", mockInput, 1000);
    job = reduce(job, { type: "start-preprocess" }, 1100);
    job = reduce(job, { type: "fail", error: "Network error" }, 1200);
    const next = reduce(job, { type: "retry" }, 1300);
    expect(next.state).toBe("pending");
    expect(next.lastError).toBeUndefined();
    expect(next.progress).toBe(0);
  });

  it("transitions to cancelled from any non-terminal state", () => {
    let job = createJob("job-1", mockInput, 1000);
    const next = reduce(job, { type: "cancel" }, 1100);
    expect(next.state).toBe("cancelled");
  });

  it("throws on illegal transition", () => {
    const job = createJob("job-1", mockInput, 1000);
    expect(() => reduce(job, { type: "start-upload" }, 1100)).toThrow(
      /illegal transition/,
    );
  });

  it("ignores progress outside uploading state", () => {
    const job = createJob("job-1", mockInput, 1000);
    const next = reduce(job, { type: "progress", progress: 0.5 }, 1100);
    expect(next).toBe(job); // no change
  });

  it("records placeholder ids idempotently", () => {
    let job = createJob("job-1", mockInput, 1000);
    job = reduce(
      job,
      {
        type: "placeholder-inserted",
        placeholderFileId: "file-placeholder-1",
        placeholderStoragePath: "proj-1/images/placeholder-1.jpg",
      },
      1100,
    );
    expect(job.placeholderFileId).toBe("file-placeholder-1");
    const next = reduce(
      job,
      {
        type: "placeholder-inserted",
        placeholderFileId: "file-placeholder-2",
        placeholderStoragePath: "proj-1/images/placeholder-2.jpg",
      },
      1200,
    );
    expect(next.placeholderFileId).toBe("file-placeholder-1"); // unchanged
  });
});

describe("isTerminal", () => {
  it("returns true for uploaded and cancelled", () => {
    expect(isTerminal("uploaded")).toBe(true);
    expect(isTerminal("cancelled")).toBe(true);
  });

  it("returns false for non-terminal states", () => {
    expect(isTerminal("pending")).toBe(false);
    expect(isTerminal("preprocessing")).toBe(false);
    expect(isTerminal("uploading")).toBe(false);
    expect(isTerminal("failed")).toBe(false);
  });
});

describe("shouldAutoRetry", () => {
  it("returns true for transient errors", () => {
    expect(shouldAutoRetry("Network request failed")).toBe(true);
    expect(shouldAutoRetry("timeout exceeded")).toBe(true);
    expect(shouldAutoRetry("Server error 503")).toBe(true);
    expect(shouldAutoRetry("Error 502")).toBe(true);
  });

  it("returns false for permanent errors", () => {
    expect(shouldAutoRetry("Bad request 400")).toBe(false);
    expect(shouldAutoRetry("Unauthorized 401")).toBe(false);
    expect(shouldAutoRetry("Forbidden 403")).toBe(false);
  });
});

describe("backoffMs", () => {
  it("returns exponential backoff with cap", () => {
    const b1 = backoffMs(1);
    expect(b1).toBeGreaterThanOrEqual(2000);
    expect(b1).toBeLessThanOrEqual(3000);

    const b2 = backoffMs(2);
    expect(b2).toBeGreaterThanOrEqual(4000);
    expect(b2).toBeLessThanOrEqual(5000);

    const b10 = backoffMs(10);
    expect(b10).toBeGreaterThanOrEqual(30_000);
    expect(b10).toBeLessThanOrEqual(31_000);
  });
});

describe("toPersisted / fromPersisted", () => {
  it("round-trips a job", () => {
    const job = createJob("job-1", mockInput, 1000);
    const persisted = toPersisted(job);
    expect(persisted.id).toBe("job-1");
    expect(persisted.state).toBe("pending");
    expect((persisted as any).progress).toBeUndefined();

    const restored = fromPersisted(persisted);
    expect(restored.id).toBe("job-1");
    expect(restored.state).toBe("pending");
    expect(restored.progress).toBe(0);
  });
});
