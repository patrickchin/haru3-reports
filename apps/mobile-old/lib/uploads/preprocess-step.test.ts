import { describe, expect, it, vi } from "vitest";
import { runPreprocessStep, type PreprocessDeps } from "./preprocess-step";
import type { EnqueueInput } from "./jobs";

function imageInput(overrides: Partial<EnqueueInput> = {}): EnqueueInput {
  return {
    kind: "project-image",
    sourceUri: "file:///tmp/p.jpg",
    filename: "p.jpg",
    mimeType: "image/jpeg",
    sizeBytes: 1024,
    projectId: "proj-1",
    reportId: null,
    uploadedBy: "u",
    category: "image",
    isImage: true,
    width: 4032,
    height: 3024,
    ...overrides,
  };
}

function docInput(): EnqueueInput {
  return {
    kind: "document",
    sourceUri: "file:///tmp/spec.pdf",
    filename: "spec.pdf",
    mimeType: "application/pdf",
    sizeBytes: 2048,
    projectId: "proj-1",
    reportId: null,
    uploadedBy: "u",
    category: "document",
    isImage: false,
  };
}

describe("runPreprocessStep", () => {
  it("no-ops for non-image jobs (workingUri = sourceUri)", async () => {
    const preprocess = vi.fn();
    const out = await runPreprocessStep(docInput(), {
      preprocess: preprocess as never,
    } as PreprocessDeps);
    expect(out.workingUri).toBe("file:///tmp/spec.pdf");
    expect(out.thumbnailUri).toBeUndefined();
    expect(preprocess).not.toHaveBeenCalled();
  });

  it("runs preprocess for image jobs and forwards width/height", async () => {
    const preprocess = vi.fn(async () => ({
      originalUri: "file:///tmp/r.jpg",
      thumbnailUri: "file:///tmp/r.thumb.jpg",
      width: 2048,
      height: 1536,
      mimeType: "image/jpeg" as const,
      blurhash: "L00",
    }));
    const out = await runPreprocessStep(imageInput(), {
      preprocess: preprocess as never,
    } as PreprocessDeps);
    expect(preprocess).toHaveBeenCalledWith("file:///tmp/p.jpg", 4032, 3024);
    expect(out).toEqual({
      workingUri: "file:///tmp/r.jpg",
      thumbnailUri: "file:///tmp/r.thumb.jpg",
      width: 2048,
      height: 1536,
      blurhash: "L00",
    });
  });

  it("falls back to width=0 / height=0 when input dimensions are missing", async () => {
    const preprocess = vi.fn(async () => ({
      originalUri: "file:///tmp/r.jpg",
      thumbnailUri: undefined,
      width: 0,
      height: 0,
      mimeType: "image/jpeg" as const,
      blurhash: null,
    }));
    await runPreprocessStep(
      imageInput({ width: undefined, height: undefined }),
      { preprocess: preprocess as never } as PreprocessDeps,
    );
    expect(preprocess).toHaveBeenCalledWith("file:///tmp/p.jpg", 0, 0);
  });
});
