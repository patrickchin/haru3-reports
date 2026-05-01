import { describe, it, expect, vi } from "vitest";
import { uploadVoiceNote, transcribeVoiceNote } from "./voice-note-flow";
import type { BackendLike, FileMetadataRow } from "./file-upload";

function makeRow(overrides: Partial<FileMetadataRow> = {}): FileMetadataRow {
  return {
    id: "vn-1",
    project_id: "proj-1",
    uploaded_by: "mike",
    bucket: "project-files",
    storage_path: "proj-1/voice-notes/uuid-1.m4a",
    category: "voice-note",
    filename: "rec.m4a",
    mime_type: "audio/m4a",
    size_bytes: 1024,
    duration_ms: 5000,
    deleted_at: null,
    created_at: "2026-04-27T00:00:00Z",
    updated_at: "2026-04-27T00:00:00Z",
    ...overrides,
  };
}

function makeBackend(opts: {
  uploadOk?: boolean;
  insertRow?: FileMetadataRow | null;
  insertError?: { message: string } | null;
} = {}) {
  const upload = vi.fn().mockResolvedValue(
    opts.uploadOk === false
      ? { data: null, error: { message: "upload boom" } }
      : { data: { path: "ok" }, error: null },
  );
  const remove = vi.fn().mockResolvedValue({ data: [{}], error: null });
  const insertSingle = vi.fn().mockResolvedValue({
    data: opts.insertRow ?? makeRow(),
    error: opts.insertError ?? null,
  });

  const insert = vi.fn(() => ({
    select: vi.fn(() => ({ single: insertSingle })),
  }));

  const backend: BackendLike = {
    storage: {
      from: vi.fn(() => ({
        upload,
        remove,
        createSignedUrl: vi.fn(),
        getPublicUrl: vi.fn(() => ({ data: { publicUrl: "" } })),
      })),
    },
    from: vi.fn(() => ({
      insert,
      update: vi.fn(),
      delete: vi.fn(() => ({ eq: vi.fn() })),
    })) as unknown as BackendLike["from"],
    rpc: vi.fn().mockResolvedValue({ data: 0, error: null }) as unknown as BackendLike["rpc"],
  };

  return { backend, upload, insertSingle };
}

const baseUploadParams = {
  projectId: "proj-1",
  uploadedBy: "mike",
  audioUri: "file:///tmp/rec.m4a",
  filename: "rec.m4a",
  mimeType: "audio/m4a",
  sizeBytes: 1024,
  durationMs: 5000,
};

describe("uploadVoiceNote", () => {
  it("reads bytes, uploads, and returns metadata", async () => {
    const m = makeBackend();
    const readBytes = vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]));

    const out = await uploadVoiceNote({
      ...baseUploadParams,
      backend: m.backend,
      readBytes,
    });

    expect(readBytes).toHaveBeenCalledWith("file:///tmp/rec.m4a");
    expect(m.upload).toHaveBeenCalled();
    expect(out.metadata).toBeTruthy();
    expect(out.storagePath).toBeDefined();
  });

  it("throws when storage upload fails", async () => {
    const m = makeBackend({ uploadOk: false });
    const readBytes = vi.fn().mockResolvedValue(new Uint8Array([1]));

    await expect(
      uploadVoiceNote({ ...baseUploadParams, backend: m.backend, readBytes }),
    ).rejects.toThrow(/upload boom/);
  });
});

describe("transcribeVoiceNote", () => {
  it("returns trimmed transcription on success", async () => {
    const transcribe = vi.fn().mockResolvedValue({ text: "  hello world  " });

    const out = await transcribeVoiceNote({
      audioUri: "file:///tmp/rec.m4a",
      transcribe,
    });

    expect(transcribe).toHaveBeenCalledWith("file:///tmp/rec.m4a");
    expect(out.transcription).toBe("hello world");
    expect(out.transcriptionFailed).toBe(false);
  });

  it("returns transcriptionFailed=true when transcribe throws", async () => {
    const transcribe = vi.fn().mockRejectedValue(new Error("network down"));

    const out = await transcribeVoiceNote({
      audioUri: "file:///tmp/rec.m4a",
      transcribe,
    });

    expect(out.transcription).toBe("");
    expect(out.transcriptionFailed).toBe(true);
    expect(out.transcriptionError).toContain("network down");
  });

  it("handles empty transcription text", async () => {
    const transcribe = vi.fn().mockResolvedValue({ text: "   " });

    const out = await transcribeVoiceNote({
      audioUri: "file:///tmp/rec.m4a",
      transcribe,
    });

    expect(out.transcription).toBe("");
    expect(out.transcriptionFailed).toBe(false);
  });
});
