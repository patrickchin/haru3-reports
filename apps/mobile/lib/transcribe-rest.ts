/**
 * REST-backed transcription path.
 *
 * Same shape as `transcribe.ts` (the Supabase edge-function path) so
 * callers don't change — selection happens in `transcribe.ts`.
 *
 * Endpoint: `POST /v1/audio/transcribe` (multipart, see
 * `packages/api/src/routes/audio/transcribe.ts`).
 */
import { apiPostForm, type RequestOptions } from "./api-client";
import type { TranscribeResult } from "./transcribe";

export async function transcribeAudioRest(
  audioUri: string,
  options: { provider?: string | null; language?: string } = {},
  reqOpts: RequestOptions = {},
): Promise<TranscribeResult> {
  const mimeType = guessMimeType(audioUri);
  const filename = filenameFromUri(audioUri);

  const form = new FormData();
  form.append(
    "audio",
    // React Native FormData accepts { uri, name, type } descriptors.
    {
      uri: audioUri,
      name: filename,
      type: mimeType,
    } as unknown as Blob,
  );
  if (options.provider) form.append("provider", options.provider);
  if (options.language) form.append("language", options.language);

  return apiPostForm<TranscribeResult>("/v1/audio/transcribe", form, reqOpts);
}

function filenameFromUri(uri: string): string {
  const parts = uri.split("/");
  return parts[parts.length - 1] || "audio.m4a";
}

function guessMimeType(uri: string): string {
  const lower = uri.toLowerCase();
  if (lower.endsWith(".m4a")) return "audio/m4a";
  if (lower.endsWith(".mp4")) return "audio/mp4";
  if (lower.endsWith(".caf")) return "audio/x-caf";
  if (lower.endsWith(".wav")) return "audio/wav";
  if (lower.endsWith(".mp3")) return "audio/mpeg";
  if (lower.endsWith(".webm")) return "audio/webm";
  if (lower.endsWith(".ogg") || lower.endsWith(".opus")) return "audio/ogg";
  return "audio/m4a";
}
