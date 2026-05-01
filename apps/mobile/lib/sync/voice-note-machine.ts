/**
 * Voice-note offline state machine.
 *
 * Two independent branches gate a voice note's lifecycle:
 *   - upload_state:        pending → uploading → done | failed
 *   - transcription_state: pending → running   → done | failed
 *
 * Both run only when online. They are independent — transcription does
 * not strictly require the upload to complete (it operates on the local
 * audio URI). However, in v1 we sequence them to reduce simultaneous
 * network usage: transcription only runs after upload_state='done'.
 *
 * After transcription succeeds, the machine creates a `report_notes` row
 * linking the voice note (file_metadata) to its report with the transcript
 * as body. This replaces the old pattern of stuffing text into the report's
 * `notes[]` array.
 *
 * This module is pure orchestration over the local DB and a pair of
 * injected I/O effects (`upload`, `transcribe`). Used by the runtime
 * worker (Phase 4 wires it up) and by tests.
 */
import type { SqlExecutor } from "../local-db/sql-executor";
import type { IdGen } from "../local-db/clock";
import { createNote } from "../local-db/repositories/report-notes-repo";

export type UploadState = "pending" | "uploading" | "done" | "failed";
export type TranscriptionState = "pending" | "running" | "done" | "failed";

export type VoiceNoteRow = {
  id: string;
  project_id: string;
  uploaded_by: string;
  bucket: string;
  storage_path: string | null;
  category: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  duration_ms: number | null;
  transcription: string | null;
  report_id: string | null;
  local_audio_path: string | null;
  upload_state: UploadState;
  transcription_state: TranscriptionState;
  sync_state: "synced" | "dirty" | "conflict";
  created_at: string;
  updated_at: string;
};

export type UploadFn = (input: {
  row: VoiceNoteRow;
}) => Promise<{ storagePath: string }>;

export type TranscribeFn = (input: {
  row: VoiceNoteRow;
}) => Promise<{ text: string }>;

/**
 * Decide what action to take next for one row. Pure — no I/O.
 */
export type NextAction =
  | { kind: "noop" }
  | { kind: "upload" }
  | { kind: "transcribe" };

export function nextAction(row: VoiceNoteRow): NextAction {
  if (row.upload_state === "pending") return { kind: "upload" };
  if (
    row.upload_state === "done" &&
    row.transcription_state === "pending" &&
    !row.transcription
  ) {
    return { kind: "transcribe" };
  }
  return { kind: "noop" };
}

/**
 * Process one row end-to-end (one branch). Caller decides ordering;
 * typically: pick next pending row, call processOne, repeat. Failures
 * mark the row as `failed` and surface in the UI; retry happens manually
 * from the user's "Retry" button.
 */
export type ProcessDeps = {
  db: SqlExecutor;
  upload: UploadFn;
  transcribe: TranscribeFn;
  now: () => string;
  newId: IdGen;
};

export type ProcessResult =
  | { kind: "uploaded"; storagePath: string }
  | { kind: "transcribed"; text: string }
  | { kind: "noop" };

export async function processOne(
  deps: ProcessDeps,
  row: VoiceNoteRow,
): Promise<ProcessResult> {
  const next = nextAction(row);
  if (next.kind === "noop") return { kind: "noop" };

  if (next.kind === "upload") {
    await deps.db.exec(
      "UPDATE file_metadata SET upload_state = 'uploading', updated_at = ? WHERE id = ?",
      [deps.now(), row.id],
    );
    try {
      const { storagePath } = await deps.upload({ row });
      await deps.db.exec(
        `UPDATE file_metadata
         SET upload_state = 'done',
             storage_path = ?,
             updated_at = ?,
             local_updated_at = ?,
             sync_state = 'dirty'
         WHERE id = ?`,
        [storagePath, deps.now(), deps.now(), row.id],
      );
      return { kind: "uploaded", storagePath };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await deps.db.exec(
        "UPDATE file_metadata SET upload_state = 'failed', updated_at = ? WHERE id = ?",
        [deps.now(), row.id],
      );
      throw new Error(`upload failed: ${msg}`);
    }
  }

  // transcribe
  await deps.db.exec(
    "UPDATE file_metadata SET transcription_state = 'running', updated_at = ? WHERE id = ?",
    [deps.now(), row.id],
  );
  try {
    const { text } = await deps.transcribe({ row });
    const trimmed = text.trim();

    // Atomic: file_metadata update + report_notes insert + outbox enqueue
    // must all succeed or all roll back. Without a transaction, a crash
    // between the file_metadata write and the report_notes insert would
    // leave transcription_state='done' with no linked note — and
    // pickPending would never revisit the row.
    await deps.db.transaction(async (tx) => {
      await tx.exec(
        `UPDATE file_metadata
         SET transcription_state = ?,
             transcription = ?,
             updated_at = ?,
             local_updated_at = ?,
             sync_state = 'dirty'
         WHERE id = ?`,
        [
          trimmed.length > 0 ? "done" : "failed",
          trimmed.length > 0 ? trimmed : null,
          deps.now(),
          deps.now(),
          row.id,
        ],
      );

      // Create a report_notes row to link this voice note to the report.
      // Uses the shared createNote helper which handles position assignment
      // and outbox enqueue within this transaction. We create the row even
      // when transcription returned empty text (body=null) so the voice
      // file is never an orphan in `file_metadata`. A later retry that
      // produces text can update the row via `updateNote`.
      if (row.report_id) {
        await createNote(
          { db: deps.db, clock: deps.now, newId: deps.newId, tx },
          {
            reportId: row.report_id,
            projectId: row.project_id,
            authorId: row.uploaded_by,
            kind: "voice",
            body: trimmed.length > 0 ? trimmed : null,
            fileId: row.id,
          },
        );
      }
    });

    return { kind: "transcribed", text: trimmed };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await deps.db.exec(
      "UPDATE file_metadata SET transcription_state = 'failed', updated_at = ? WHERE id = ?",
      [deps.now(), row.id],
    );
    throw new Error(`transcribe failed: ${msg}`);
  }
}

/**
 * Pick the oldest row that has work to do.
 */
export async function pickPending(
  db: SqlExecutor,
  category: string = "voice-note",
): Promise<VoiceNoteRow | null> {
  return db.get<VoiceNoteRow>(
    `SELECT * FROM file_metadata
     WHERE category = ?
       AND deleted_at IS NULL
       AND (
         upload_state IN ('pending')
         OR (upload_state = 'done' AND transcription_state = 'pending' AND transcription IS NULL)
       )
     ORDER BY created_at ASC
     LIMIT 1`,
    [category],
  );
}

/**
 * Reset a `failed` row back to `pending` so the user can retry from the
 * UI. Pure DB write — does not call upload/transcribe directly.
 */
export async function retryVoiceNote(
  db: SqlExecutor,
  id: string,
  now: string,
): Promise<void> {
  await db.exec(
    `UPDATE file_metadata SET
       upload_state = CASE WHEN upload_state = 'failed' THEN 'pending' ELSE upload_state END,
       transcription_state = CASE
         WHEN transcription_state = 'failed' THEN 'pending'
         ELSE transcription_state END,
       updated_at = ?
     WHERE id = ?`,
    [now, id],
  );
}
