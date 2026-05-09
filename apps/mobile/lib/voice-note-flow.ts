/**
 * Voice-note orchestration: upload audio + transcribe.
 *
 * Audio upload uses the standard local-URI → bytes path (`uriToBlob`) before
 * handing the body to Supabase Storage as a `Uint8Array`. Transcription still
 * comes through an injected dependency so the edge-function call remains
 * unit-testable.
 */
import {
  uploadProjectFile,
  type BackendLike,
  type FileMetadataRow,
} from "./file-upload";
import { uriToBlob } from "@/lib/uploads/blob";

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
};

export type TranscribeVoiceNoteParams = {
  audioUri: string;
  /** Transcribes audio at a URI — wraps `transcribeAudio` in production. */
  transcribe: TranscribeFn;
};

export type TranscribeVoiceNoteResult = {
  transcription: string;
  /** True if transcription failed but the upload + metadata row succeeded. */
  transcriptionFailed: boolean;
  transcriptionError?: string;
};

export async function uploadVoiceNote(
  params: UploadVoiceNoteParams,
): Promise<{ metadata: FileMetadataRow; storagePath: string }> {
  const { body } = await uriToBlob(params.audioUri);

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
