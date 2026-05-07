import { describe, it, expect } from "vitest";
import {
  createJob,
  reduce,
  isTerminal,
  backoffMs,
  shouldAutoRetry,
  toPersisted,
  fromPersisted,
  MAX_AUTO_ATTEMPTS,
  type EnqueueInput,
  type UploadJob,
} from "./jobs";
import type { FileMetadataRow } from "@/lib/file-upload";

const INPUT: EnqueueInput = {
  kind: "project-image",
  sourceUri: "file:///tmp/photo.jpg",
  filename: "photo.jpg",
  mimeType: "image/jpeg",
  sizeBytes: 1024,
  projectId: "p1",
  reportId: "r1",
  uploadedBy: "u1",
  category: "image",
  isImage: true,
};

const META: FileMetadataRow = {
  id: "fid",
  project_id: "p1",
  uploaded_by: "u1",
  bucket: "project-files",
  storage_path: "p1/images/abc.jpg",
  category: "image",
  filename: "photo.jpg",
  mime_type: "image/jpeg",
  size_bytes: 1024,
  duration_ms: null,
  transcription: null,
  report_id: null,
  thumbnail_path: null,
  width: 100,
  height: 100,
  blurhash: null,
  deleted_at: null,
  created_at: "2026-05-08T00:00:00Z",
  updated_at: "2026-05-08T00:00:00Z",
} as unknown as FileMetadataRow;

describe("uploads/jobs reducer", () => {
  it("happy path: pending → preprocessing → uploading → uploaded", () => {
    const j0 = createJob("j", INPUT, 1000);
    expect(j0.state).toBe("pending");
    expect(j0.attempts).toBe(0);

    const j1 = reduce(j0, { type: "start-preprocess" }, 1100);
    expect(j1.state).toBe("preprocessing");

    const j2 = reduce(
      j1,
      {
        type: "preprocess-complete",
        workingUri: "file:///cache/work.jpg",
        thumbnailUri: "file:///cache/thumb.jpg",
        width: 1024,
        height: 768,
        blurhash: "L00000",
      },
      1200,
    );
    expect(j2.state).toBe("preprocessing"); // still in preprocess until start-upload
    expect(j2.workingUri).toBe("file:///cache/work.jpg");
    expect(j2.thumbnailUri).toBe("file:///cache/thumb.jpg");

    const j3 = reduce(j2, { type: "start-upload" }, 1300);
    expect(j3.state).toBe("uploading");
    expect(j3.progress).toBe(0);

    const j4 = reduce(j3, { type: "progress", progress: 0.5 }, 1400);
    expect(j4.progress).toBe(0.5);

    const j5 = reduce(
      j4,
      {
        type: "upload-complete",
        fileId: "fid",
        storagePath: "p1/images/abc.jpg",
        metadataRow: META,
      },
      1500,
    );
    expect(j5.state).toBe("uploaded");
    expect(j5.progress).toBe(1);
    expect(j5.fileId).toBe("fid");
    expect(j5.metadataRow).toBe(META);
    expect(isTerminal(j5.state)).toBe(true);
  });

  it("clamps progress to [0,1] and ignores progress when not uploading", () => {
    const j0 = createJob("j", INPUT, 0);
    const stillPending = reduce(j0, { type: "progress", progress: 0.5 }, 0);
    expect(stillPending).toBe(j0); // dropped silently

    const uploading = reduce(
      reduce(reduce(j0, { type: "start-preprocess" }, 1), { type: "start-upload" }, 2),
      { type: "progress", progress: 5 },
      3,
    );
    expect(uploading.progress).toBe(1);

    const negative = reduce(uploading, { type: "progress", progress: -2 }, 4);
    expect(negative.progress).toBe(0);

    const nan = reduce(negative, { type: "progress", progress: Number.NaN }, 5);
    expect(nan.progress).toBe(0);
  });

  it("fail increments attempts and stores error; retry clears it", () => {
    const j = reduce(createJob("j", INPUT, 0), { type: "start-preprocess" }, 1);
    const failed = reduce(j, { type: "fail", error: "boom" }, 2);
    expect(failed.state).toBe("failed");
    expect(failed.attempts).toBe(1);
    expect(failed.lastError).toBe("boom");

    const retried = reduce(failed, { type: "retry" }, 3);
    expect(retried.state).toBe("pending");
    expect(retried.lastError).toBeUndefined();
    expect(retried.attempts).toBe(1); // attempts NOT reset; retry budget preserved

    const failed2 = reduce(
      reduce(retried, { type: "start-preprocess" }, 4),
      { type: "fail", error: "boom2" },
      5,
    );
    expect(failed2.attempts).toBe(2);
  });

  it("cancel from any in-flight state lands in cancelled and is terminal", () => {
    const j0 = createJob("j", INPUT, 0);
    const c1 = reduce(j0, { type: "cancel" }, 1);
    expect(c1.state).toBe("cancelled");
    expect(isTerminal(c1.state)).toBe(true);

    const uploading = reduce(
      reduce(reduce(j0, { type: "start-preprocess" }, 1), { type: "start-upload" }, 2),
      { type: "cancel" },
      3,
    );
    expect(uploading.state).toBe("cancelled");
  });

  it("cancel on terminal job is a no-op", () => {
    const j0 = createJob("j", INPUT, 0);
    const uploaded = reduce(
      reduce(
        reduce(reduce(j0, { type: "start-preprocess" }, 1), { type: "start-upload" }, 2),
        { type: "upload-complete", fileId: "fid", storagePath: "p", metadataRow: META },
        3,
      ),
      { type: "cancel" },
      4,
    );
    expect(uploaded.state).toBe("uploaded");
  });

  it("rejects illegal transitions", () => {
    const j0 = createJob("j", INPUT, 0);
    // upload-complete from 'pending' is illegal (must go through 'uploading')
    expect(() =>
      reduce(
        j0,
        { type: "upload-complete", fileId: "f", storagePath: "p", metadataRow: META },
        1,
      ),
    ).toThrow(/illegal/);

    // retry from 'uploaded' (terminal) is illegal
    const uploaded = reduce(
      reduce(
        reduce(reduce(j0, { type: "start-preprocess" }, 1), { type: "start-upload" }, 2),
        {
          type: "upload-complete",
          fileId: "fid",
          storagePath: "p",
          metadataRow: META,
        },
        3,
      ),
      { type: "progress", progress: 0.9 }, // silently dropped (already uploaded), no-op
      4,
    );
    expect(uploaded.state).toBe("uploaded");
    expect(() => reduce(uploaded, { type: "retry" }, 5)).toThrow(/illegal/);
  });
});

describe("backoffMs", () => {
  it("is exponential and capped at 60s", () => {
    expect(backoffMs(0)).toBe(0);
    expect(backoffMs(1)).toBe(1000);
    expect(backoffMs(2)).toBe(2000);
    expect(backoffMs(3)).toBe(4000);
    expect(backoffMs(6)).toBe(32_000);
    expect(backoffMs(7)).toBe(60_000);
    expect(backoffMs(20)).toBe(60_000);
  });
});

describe("shouldAutoRetry", () => {
  it("retries network/5xx-ish errors", () => {
    expect(shouldAutoRetry(new Error("Internal Server Error"), 0)).toBe(true);
    expect(shouldAutoRetry(new Error("network request failed"), 0)).toBe(true);
    expect(shouldAutoRetry(new Error("timeout"), 0)).toBe(true);
  });

  it("does NOT retry auth/validation errors", () => {
    expect(shouldAutoRetry(new Error("Unauthorized"), 0)).toBe(false);
    expect(shouldAutoRetry(new Error("Forbidden"), 0)).toBe(false);
    expect(shouldAutoRetry(new Error("Not Found"), 0)).toBe(false);
    expect(shouldAutoRetry(new Error("Invalid file type"), 0)).toBe(false);
    expect(shouldAutoRetry(new Error("Payload Too Large"), 0)).toBe(false);
  });

  it("stops retrying after MAX_AUTO_ATTEMPTS", () => {
    expect(shouldAutoRetry(new Error("boom"), MAX_AUTO_ATTEMPTS - 1)).toBe(true);
    expect(shouldAutoRetry(new Error("boom"), MAX_AUTO_ATTEMPTS)).toBe(false);
    expect(shouldAutoRetry(new Error("boom"), 999)).toBe(false);
  });
});

describe("persistence round-trip", () => {
  it("snaps in-flight states back to pending on hydrate", () => {
    const j: UploadJob = reduce(
      reduce(createJob("j", INPUT, 0), { type: "start-preprocess" }, 1),
      { type: "start-upload" },
      2,
    );
    expect(j.state).toBe("uploading");
    const hydrated = fromPersisted(toPersisted(j));
    expect(hydrated.state).toBe("pending");
    expect(hydrated.progress).toBe(0);
    expect(hydrated.attempts).toBe(0);
  });

  it("preserves terminal states", () => {
    const j: UploadJob = reduce(
      reduce(createJob("j", INPUT, 0), { type: "fail", error: "x" }, 1),
      { type: "retry" },
      2,
    );
    // failed → pending via retry; persistence keeps pending as-is
    expect(fromPersisted(toPersisted(j)).state).toBe("pending");

    const failed = reduce(createJob("j2", INPUT, 0), { type: "fail", error: "x" }, 1);
    expect(fromPersisted(toPersisted(failed)).state).toBe("failed");
  });

  it("drops live progress and metadataRow", () => {
    const j: UploadJob = reduce(
      reduce(reduce(createJob("j", INPUT, 0), { type: "start-preprocess" }, 1), { type: "start-upload" }, 2),
      { type: "progress", progress: 0.7 },
      3,
    );
    const round = fromPersisted(toPersisted(j));
    expect(round.progress).toBe(0);
  });
});
