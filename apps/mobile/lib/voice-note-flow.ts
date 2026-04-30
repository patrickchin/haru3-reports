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

export type UploadVoiceNoteParams = {
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
};

export type TranscribeVoiceNoteParams = {
  audioUri: string;
  /** Transcribes audio at a URI — wraps `transcribeAudio` in production. */
  transcribe: TranscribeFn;
};

export type RecordVoiceNoteParams = UploadVoiceNoteParams & TranscribeVoiceNoteParams;

export type TranscribeVoiceNoteResult = {
  transcription: string;
  /** True if transcription failed but the upload + metadata row succeeded. */
  transcriptionFailed: boolean;
  transcriptionError?: string;
};

export type RecordVoiceNoteResult = {
  metadata: FileMetadataRow;
  storagePath: string;
} & TranscribeVoiceNoteResult;

export async function uploadVoiceNote(
  params: UploadVoiceNoteParams,
): Promise<{ metadata: FileMetadataRow; storagePath: string }> {
  const body = await params.readBytes(params.audioUri);

  return uploadProjectFile({
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
}

export async function transcribeVoiceNote(
  params: TranscribeVoiceNoteParams,
): Promise<TranscribeVoiceNoteResult> {
  try {
    const result = await params.transcribe(params.audioUri);
    return {
      transcription: result.text.trim(),
      transcriptionFailed: false,
    };
  } catch (err) {
    return {
      transcription: "",
      transcriptionFailed: true,
      transcriptionError: err instanceof Error ? err.message : String(err),
    };
  }
}

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
  const uploaded = await uploadVoiceNote(params);
  const transcription = await transcribeVoiceNote(params);

  return {
    metadata: uploaded.metadata,
    storagePath: uploaded.storagePath,
    ...transcription,
  };
}
