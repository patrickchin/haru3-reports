import { backend } from "./backend";

/**
 * Transcription provider override for the whole mobile app.
 *
 * Leave as `null` to use the server-side default (set via the
 * TRANSCRIPTION_PROVIDER env var on the Supabase function).
 * Set to one of: "groq" | "openai" | "openai-whisper" | "deepgram"
 * to force that provider from the client.
 */
export const TRANSCRIPTION_PROVIDER: string | null =
  process.env.EXPO_PUBLIC_TRANSCRIPTION_PROVIDER ?? null;

export type TranscribeResult = {
  text: string;
  provider: string;
  model: string;
  durationMs: number;
};

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;

/**
 * Upload a recorded audio file to the transcribe-audio edge function.
 *
 * `audioUri` is a local file URI (e.g. from expo-audio's recorder).
 */
export async function transcribeAudio(
  audioUri: string,
  options: { provider?: string | null; language?: string } = {},
): Promise<TranscribeResult> {
  const {
    data: { session },
  } = await backend.auth.getSession();
  if (!session) throw new Error("Not authenticated");

  const mimeType = guessMimeType(audioUri);
  const filename = filenameFromUri(audioUri);

  const form = new FormData();
  // React Native FormData accepts { uri, name, type } descriptors.
  form.append("audio", {
    uri: audioUri,
    name: filename,
    type: mimeType,
  } as unknown as Blob);

  const provider = options.provider ?? TRANSCRIPTION_PROVIDER;
  if (provider) form.append("provider", provider);
  if (options.language) form.append("language", options.language);

  const res = await fetch(`${supabaseUrl}/functions/v1/transcribe-audio`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
    body: form,
  });

  const text = await res.text();
  if (!res.ok) {
    let message = text;
    try {
      const parsed = JSON.parse(text) as { error?: string };
      if (parsed.error) message = parsed.error;
    } catch {
      // Keep raw text as message
    }
    throw new Error(`Transcription failed (${res.status}): ${message}`);
  }

  return JSON.parse(text) as TranscribeResult;
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
