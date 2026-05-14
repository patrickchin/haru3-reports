// Pluggable transcription providers.
//
// To add a new provider:
//   1. Implement a TranscriptionProvider and add it to PROVIDERS below.
//   2. Set its API key in Supabase Function secrets (e.g. GROQ_API_KEY).
//   3. Optionally set TRANSCRIPTION_PROVIDER=<id> to make it the default.
//
// The mobile client can also override the provider per-request via the
// "provider" form field.

export type TranscribeParams = {
  audio: Uint8Array;
  mimeType: string;
  filename: string;
  language?: string;
};

export type TranscribeResult = {
  text: string;
  model: string;
};

export type TranscriptionProvider = {
  id: string;
  envKey: string;
  model: string;
  transcribe: (params: TranscribeParams, apiKey: string) => Promise<TranscribeResult>;
};

// OpenAI-compatible /audio/transcriptions endpoint (OpenAI + Groq share this shape).
async function openaiCompatibleTranscribe(
  baseURL: string,
  model: string,
  { audio, mimeType, filename, language }: TranscribeParams,
  apiKey: string,
): Promise<TranscribeResult> {
  const formData = new FormData();
  // Cast to BlobPart: Deno's lib.dom types narrow Uint8Array's buffer to
  // ArrayBuffer | SharedArrayBuffer, while Blob expects ArrayBuffer.
  formData.append(
    "file",
    new Blob([audio as BlobPart], { type: mimeType }),
    filename,
  );
  formData.append("model", model);
  formData.append("response_format", "json");
  if (language) formData.append("language", language);

  const res = await fetch(`${baseURL}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(
      `${model} transcription failed: ${res.status} ${errText}`,
    );
  }

  const data = (await res.json()) as { text?: string };
  return { text: data.text ?? "", model };
}

async function deepgramTranscribe(
  { audio, mimeType, language }: TranscribeParams,
  apiKey: string,
): Promise<TranscribeResult> {
  const params = new URLSearchParams({
    model: "nova-3",
    smart_format: "true",
    punctuate: "true",
  });
  if (language) params.set("language", language);

  const res = await fetch(
    `https://api.deepgram.com/v1/listen?${params.toString()}`,
    {
      method: "POST",
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": mimeType,
      },
      body: audio,
    },
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`deepgram transcription failed: ${res.status} ${errText}`);
  }

  const data = (await res.json()) as {
    results?: {
      channels?: Array<{
        alternatives?: Array<{ transcript?: string }>;
      }>;
    };
  };
  const text =
    data.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "";
  return { text, model: "nova-3" };
}

export const PROVIDERS: Record<string, TranscriptionProvider> = {
  openai: {
    id: "openai",
    envKey: "OPENAI_API_KEY",
    model: "gpt-4o-mini-transcribe",
    transcribe: (p, k) =>
      openaiCompatibleTranscribe(
        "https://api.openai.com/v1",
        "gpt-4o-mini-transcribe",
        p,
        k,
      ),
  },
  "openai-whisper": {
    id: "openai-whisper",
    envKey: "OPENAI_API_KEY",
    model: "whisper-1",
    transcribe: (p, k) =>
      openaiCompatibleTranscribe(
        "https://api.openai.com/v1",
        "whisper-1",
        p,
        k,
      ),
  },
  groq: {
    id: "groq",
    envKey: "GROQ_API_KEY",
    model: "whisper-large-v3-turbo",
    transcribe: (p, k) =>
      openaiCompatibleTranscribe(
        "https://api.groq.com/openai/v1",
        "whisper-large-v3-turbo",
        p,
        k,
      ),
  },
  deepgram: {
    id: "deepgram",
    envKey: "DEEPGRAM_API_KEY",
    model: "nova-3",
    transcribe: deepgramTranscribe,
  },
};

export function listAvailableProviders(): string[] {
  return Object.values(PROVIDERS)
    .filter((p) => !!Deno.env.get(p.envKey))
    .map((p) => p.id);
}

export function resolveProvider(requested?: string | null): TranscriptionProvider {
  const id = (
    requested ?? Deno.env.get("TRANSCRIPTION_PROVIDER") ?? "groq"
  ).toLowerCase();
  const provider = PROVIDERS[id];
  if (!provider) {
    throw new Error(
      `Unknown transcription provider: "${id}". Available: ${
        Object.keys(PROVIDERS).join(", ")
      }`,
    );
  }
  return provider;
}
