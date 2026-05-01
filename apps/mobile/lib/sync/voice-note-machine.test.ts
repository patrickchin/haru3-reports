import { describe, it, expect, vi } from "vitest";

import { openInMemoryDb } from "../local-db/better-sqlite-adapter";
import { runMigrations } from "../local-db/run-migrations";
import {
  nextAction,
  pickPending,
  processOne,
  retryVoiceNote,
  type VoiceNoteRow,
} from "./voice-note-machine";

const NOW = "2026-04-27T00:00:00Z";
const now = () => NOW;
let idCounter = 0;
const newId = () => `note-${++idCounter}`;

async function seedRow(
  db: import("../local-db/sql-executor").SqlExecutor,
  overrides: Partial<VoiceNoteRow> = {},
): Promise<VoiceNoteRow> {
  const row: VoiceNoteRow = {
    id: "vn1",
    project_id: "p1",
    uploaded_by: "u1",
    bucket: "project-files",
    storage_path: null,
    category: "voice-note",
    filename: "note.m4a",
    mime_type: "audio/m4a",
    size_bytes: 1024,
    duration_ms: 5000,
    transcription: null,
    report_id: "r1",
    local_audio_path: "/tmp/note.m4a",
    upload_state: "pending",
    transcription_state: "pending",
    sync_state: "dirty",
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
  await db.exec(
    `INSERT INTO file_metadata (
      id, project_id, uploaded_by, bucket, storage_path, category,
      filename, mime_type, size_bytes, duration_ms, transcription,
      report_id, local_audio_path, transcription_state, upload_state,
      created_at, updated_at, local_updated_at, sync_state
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      row.id, row.project_id, row.uploaded_by, row.bucket, row.storage_path, row.category,
      row.filename, row.mime_type, row.size_bytes, row.duration_ms, row.transcription,
      row.report_id, row.local_audio_path, row.transcription_state, row.upload_state,
      row.created_at, row.updated_at, NOW, "dirty",
    ],
  );
  return row;
}

describe("nextAction", () => {
  it("upload first when upload pending", () => {
    const r = makeRow({ upload_state: "pending" });
    expect(nextAction(r)).toEqual({ kind: "upload" });
  });
  it("transcribe after upload done", () => {
    const r = makeRow({
      upload_state: "done",
      transcription_state: "pending",
    });
    expect(nextAction(r)).toEqual({ kind: "transcribe" });
  });
  it("noop when transcription done", () => {
    const r = makeRow({
      upload_state: "done",
      transcription_state: "done",
      transcription: "x",
    });
    expect(nextAction(r)).toEqual({ kind: "noop" });
  });
  it("noop when uploading is in flight", () => {
    expect(
      nextAction(makeRow({ upload_state: "uploading" })),
    ).toEqual({ kind: "noop" });
  });
  it("noop when failed", () => {
    expect(
      nextAction(makeRow({ upload_state: "failed" })),
    ).toEqual({ kind: "noop" });
    expect(
      nextAction(
        makeRow({ upload_state: "done", transcription_state: "failed" }),
      ),
    ).toEqual({ kind: "noop" });
  });
});

describe("processOne", () => {
  it("uploads then leaves transcription pending", async () => {
    const handle = openInMemoryDb();
    try {
      await runMigrations(handle.db);
      const row = await seedRow(handle.db);
      const upload = vi.fn(async () => ({ storagePath: "p/u/v.m4a" }));
      const transcribe = vi.fn(async () => ({ text: "ignored" }));

      const result = await processOne(
        { db: handle.db, upload, transcribe, now, newId },
        row,
      );

      expect(result).toEqual({ kind: "uploaded", storagePath: "p/u/v.m4a" });
      expect(upload).toHaveBeenCalledOnce();
      expect(transcribe).not.toHaveBeenCalled();
      const after = await pickPending(handle.db);
      expect(after?.upload_state).toBe("done");
      expect(after?.transcription_state).toBe("pending");
      expect(after?.storage_path).toBe("p/u/v.m4a");
      expect(after?.sync_state).toBe("dirty");
    } finally {
      handle.close();
    }
  });

  it("marks upload_state=failed when upload throws", async () => {
    const handle = openInMemoryDb();
    try {
      await runMigrations(handle.db);
      const row = await seedRow(handle.db);
      const upload = vi.fn(async () => {
        throw new Error("502 bad gateway");
      });
      const transcribe = vi.fn(async () => ({ text: "" }));
      await expect(
        processOne({ db: handle.db, upload, transcribe, now, newId }, row),
      ).rejects.toThrow(/upload failed/);
      const after = await handle.db.get<VoiceNoteRow>(
        "SELECT * FROM file_metadata WHERE id = ?",
        [row.id],
      );
      expect(after?.upload_state).toBe("failed");
      expect(after?.transcription_state).toBe("pending");
    } finally {
      handle.close();
    }
  });

  it("transcribes once upload is done", async () => {
    const handle = openInMemoryDb();
    try {
      await runMigrations(handle.db);
      const row = await seedRow(handle.db, {
        upload_state: "done",
        storage_path: "p/u/v.m4a",
      });
      const upload = vi.fn(async () => ({ storagePath: "" }));
      const transcribe = vi.fn(async () => ({ text: " hello world " }));
      const result = await processOne(
        { db: handle.db, upload, transcribe, now, newId },
        row,
      );
      expect(result).toEqual({ kind: "transcribed", text: "hello world" });
      expect(upload).not.toHaveBeenCalled();
      const after = await handle.db.get<VoiceNoteRow>(
        "SELECT * FROM file_metadata WHERE id = ?",
        [row.id],
      );
      expect(after?.transcription).toBe("hello world");
      expect(after?.transcription_state).toBe("done");
      expect(after?.sync_state).toBe("dirty");

      // Verify a report_notes row was created.
      const noteRow = await handle.db.get<{ kind: string; body: string; file_id: string; report_id: string }>(
        "SELECT kind, body, file_id, report_id FROM report_notes WHERE file_id = ?",
        [row.id],
      );
      expect(noteRow).not.toBeNull();
      expect(noteRow!.kind).toBe("voice");
      expect(noteRow!.body).toBe("hello world");
      expect(noteRow!.file_id).toBe(row.id);

      // Verify an outbox row was enqueued so the note syncs to the server.
      const outboxRow = await handle.db.get<{ entity: string; op: string; payload_json: string }>(
        "SELECT entity, op, payload_json FROM outbox WHERE entity = 'report_note'",
        [],
      );
      expect(outboxRow).not.toBeNull();
      expect(outboxRow!.entity).toBe("report_note");
      expect(outboxRow!.op).toBe("insert");
      const payload = JSON.parse(outboxRow!.payload_json) as { kind: string; body: string; file_id: string };
      expect(payload.kind).toBe("voice");
      expect(payload.body).toBe("hello world");
      expect(payload.file_id).toBe(row.id);
    } finally {
      handle.close();
    }
  });

  it("treats empty transcription as failed without losing audio", async () => {
    const handle = openInMemoryDb();
    try {
      await runMigrations(handle.db);
      const row = await seedRow(handle.db, {
        upload_state: "done",
      });
      const transcribe = vi.fn(async () => ({ text: "   " }));
      const result = await processOne(
        {
          db: handle.db,
          upload: vi.fn(),
          transcribe,
          now,
          newId,
        },
        row,
      );
      expect(result).toEqual({ kind: "transcribed", text: "" });
      const after = await handle.db.get<VoiceNoteRow>(
        "SELECT * FROM file_metadata WHERE id = ?",
        [row.id],
      );
      expect(after?.transcription_state).toBe("failed");
      expect(after?.transcription).toBeNull();

      // Invariant: even with an empty transcript, a `report_notes` row
      // MUST exist for this voice file. Otherwise the file is an orphan
      // in `file_metadata` (visible in storage, never linked to any
      // report). The body is null but the file_id link is what makes
      // the report aware of the audio.
      const noteRow = await handle.db.get<{
        kind: string;
        body: string | null;
        file_id: string;
        report_id: string;
      }>(
        "SELECT kind, body, file_id, report_id FROM report_notes WHERE file_id = ?",
        [row.id],
      );
      expect(noteRow).not.toBeNull();
      expect(noteRow!.kind).toBe("voice");
      expect(noteRow!.body).toBeNull();
      expect(noteRow!.file_id).toBe(row.id);
      expect(noteRow!.report_id).toBe("r1");
    } finally {
      handle.close();
    }
  });

  it("does not create a report_notes row when report_id is null", async () => {
    // Voice notes captured outside a draft (project-level) have no
    // report_id and therefore no report to link to. They remain in
    // `file_metadata` only — which is the intended state for project
    // assets, not an orphan.
    const handle = openInMemoryDb();
    try {
      await runMigrations(handle.db);
      const row = await seedRow(handle.db, {
        upload_state: "done",
        report_id: null,
      });
      const transcribe = vi.fn(async () => ({ text: "loose voice memo" }));
      await processOne(
        { db: handle.db, upload: vi.fn(), transcribe, now, newId },
        row,
      );
      const noteCount = await handle.db.get<{ c: number }>(
        "SELECT COUNT(*) as c FROM report_notes WHERE file_id = ?",
        [row.id],
      );
      expect(noteCount?.c).toBe(0);
    } finally {
      handle.close();
    }
  });
});

describe("pickPending + retryVoiceNote", () => {
  it("ignores rows that have completed both branches", async () => {
    const handle = openInMemoryDb();
    try {
      await runMigrations(handle.db);
      await seedRow(handle.db, {
        id: "done1",
        upload_state: "done",
        transcription_state: "done",
        transcription: "yes",
      });
      const next = await pickPending(handle.db);
      expect(next).toBeNull();
    } finally {
      handle.close();
    }
  });

  it("retryVoiceNote resets failed states to pending", async () => {
    const handle = openInMemoryDb();
    try {
      await runMigrations(handle.db);
      await seedRow(handle.db, {
        upload_state: "failed",
        transcription_state: "failed",
      });
      await retryVoiceNote(handle.db, "vn1", NOW);
      const after = await pickPending(handle.db);
      expect(after?.upload_state).toBe("pending");
      expect(after?.transcription_state).toBe("pending");
    } finally {
      handle.close();
    }
  });
});

function makeRow(over: Partial<VoiceNoteRow>): VoiceNoteRow {
  return {
    id: "vn1",
    project_id: "p1",
    uploaded_by: "u1",
    bucket: "b",
    storage_path: null,
    category: "voice-note",
    filename: "f.m4a",
    mime_type: "audio/m4a",
    size_bytes: 1,
    duration_ms: 1,
    transcription: null,
    report_id: null,
    local_audio_path: "/tmp/f.m4a",
    upload_state: "pending",
    transcription_state: "pending",
    sync_state: "dirty",
    created_at: NOW,
    updated_at: NOW,
    ...over,
  };
}
