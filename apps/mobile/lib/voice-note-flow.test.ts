import { describe, it, expect, vi } from "vitest";
import { recordVoiceNote } from "./voice-note-flow";
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
  updateRow?: FileMetadataRow | null;
  updateError?: { message: string } | null;
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
  const updateSingle = vi.fn().mockResolvedValue({
    data: opts.updateRow ?? makeRow(),
    error: opts.updateError ?? null,
  });

  const insert = vi.fn(() => ({
    select: vi.fn(() => ({ single: insertSingle })),
  }));
  const update = vi.fn(() => ({
    eq: vi.fn(() => ({
      select: vi.fn(() => ({ single: updateSingle })),
    })),
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
      update,
      delete: vi.fn(() => ({ eq: vi.fn() })),
    })) as unknown as BackendLike["from"],
  };

  return { backend, upload, remove, insert, update, insertSingle, updateSingle };
}

const baseParams = {
  projectId: "proj-1",
  uploadedBy: "mike",
  audioUri: "file:///tmp/rec.m4a",
  filename: "rec.m4a",
  mimeType: "audio/m4a",
  sizeBytes: 1024,
  durationMs: 5000,
};

describe("recordVoiceNote", () => {
  it("uploads, transcribes, and returns result on the happy path", async () => {
    const m = makeBackend();
    const readBytes = vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]));
    const transcribe = vi.fn().mockResolvedValue({ text: "  hello world  " });

    const out = await recordVoiceNote({
      ...baseParams,
      backend: m.backend,
      readBytes,
      transcribe,
    });

    expect(readBytes).toHaveBeenCalledWith("file:///tmp/rec.m4a");
    expect(m.upload).toHaveBeenCalled();
    expect(transcribe).toHaveBeenCalledWith("file:///tmp/rec.m4a");
    expect(out.transcription).toBe("hello world");
    expect(out.transcriptionFailed).toBe(false);
  });

  it("returns transcriptionFailed=true when the transcribe call throws", async () => {
    const m = makeBackend();
    const readBytes = vi.fn().mockResolvedValue(new Uint8Array([1]));
    const transcribe = vi.fn().mockRejectedValue(new Error("network down"));

    const out = await recordVoiceNote({
      ...baseParams,
      backend: m.backend,
      readBytes,
      transcribe,
    });

    expect(out.transcription).toBe("");
    expect(out.transcriptionFailed).toBe(true);
    expect(out.transcriptionError).toContain("network down");
    expect(out.metadata).toBeTruthy(); // upload still succeeded
    expect(m.update).not.toHaveBeenCalled();
  });

  it("does not fail when transcription text is empty", async () => {
    const m = makeBackend();
    const readBytes = vi.fn().mockResolvedValue(new Uint8Array([1]));
    const transcribe = vi.fn().mockResolvedValue({ text: "   " });

    const out = await recordVoiceNote({
      ...baseParams,
      backend: m.backend,
      readBytes,
      transcribe,
    });

    expect(out.transcription).toBe("");
    expect(out.transcriptionFailed).toBe(false);
  });

  it("propagates upload failures (no metadata row, no transcription)", async () => {
    const m = makeBackend({ uploadOk: false });
    const readBytes = vi.fn().mockResolvedValue(new Uint8Array([1]));
    const transcribe = vi.fn();

    await expect(
      recordVoiceNote({
        ...baseParams,
        backend: m.backend,
        readBytes,
        transcribe,
      }),
    ).rejects.toThrow(/upload boom/);

    expect(transcribe).not.toHaveBeenCalled();
  });
});
