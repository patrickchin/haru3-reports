/**
 * Voice-note orchestration: upload audio + transcribe.
 *
 * Pure orchestration — all I/O comes through injected dependencies so this
 * is unit-testable without a Supabase or Expo runtime.
 */
import {
  uploadProjectFile,
  type BackendLike,
  type FileMetadataRow,
} from "./file-upload";

export type ReadFileBytes = (uri: string) => Promise<Uint8Array>;
export type TranscribeFn = (uri: string) => Promise<{ text: string }>;

export type RecordVoiceNoteParams = {
  backend: BackendLike;
  projectId: string;
  uploadedBy: string;
  audioUri: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  durationMs?: number | null;
  /** Reads file bytes from a local URI — wraps `expo-file-system` in production. */
  readBytes: ReadFileBytes;
  /** Transcribes audio at a URI — wraps `transcribeAudio` in production. */
  transcribe: TranscribeFn;
};

export type RecordVoiceNoteResult = {
  metadata: FileMetadataRow;
  storagePath: string;
  transcription: string;
  /** True if transcription failed but the upload + metadata row succeeded. */
  transcriptionFailed: boolean;
  transcriptionError?: string;
};

/**
 * Persist a recorded voice note end-to-end.
 *
 * Flow:
 *   1. Read bytes from local URI.
 *   2. Upload to Supabase Storage and create file_metadata row.
 *   3. Transcribe via the existing edge function.
 *
 * Failure modes:
 *   - Step 1/2: throws (no row created → caller treats as full failure).
 *   - Step 3:   returned with `transcriptionFailed: true` and empty
 *     `transcription`. The audio is still saved and replayable; users can
 *     retry transcription manually later.
 */
export async function recordVoiceNote(
  params: RecordVoiceNoteParams,
): Promise<RecordVoiceNoteResult> {
  const body = await params.readBytes(params.audioUri);

  const uploaded = await uploadProjectFile({
    backend: params.backend,
    projectId: params.projectId,
    uploadedBy: params.uploadedBy,
    category: "voice-note",
    body,
    filename: params.filename,
    mimeType: params.mimeType,
    sizeBytes: params.sizeBytes,
    durationMs: params.durationMs ?? null,
  });

  let transcription = "";
  let transcriptionFailed = false;
  let transcriptionError: string | undefined;

  try {
    const result = await params.transcribe(params.audioUri);
    transcription = result.text.trim();
  } catch (err) {
    transcriptionFailed = true;
    transcriptionError = err instanceof Error ? err.message : String(err);
  }

  return {
    metadata: uploaded.metadata,
    storagePath: uploaded.storagePath,
    transcription,
    transcriptionFailed,
    transcriptionError,
  };
}
