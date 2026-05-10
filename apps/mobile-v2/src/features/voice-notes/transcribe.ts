/**
 * Transcribe audio via transcribe-audio edge function.
 *
 * Inline fixture mode per design-principles.md §4.
 */
import { supabase } from "@/infra/supabase";
import { env } from "@/infra/env";
import { z } from "zod";

const transcribeResponseSchema = z.object({
  transcript: z.string(),
  durationSeconds: z.number().optional(),
  provider: z.string().optional(),
  model: z.string().optional(),
});

export type TranscribeResult = {
  transcript: string;
  durationSeconds?: number;
};

const FIXTURE_TRANSCRIPT =
  "Mocked voice note for E2E. The crew wrapped up the ground floor " +
  "concrete pour around eleven thirty using a forty MPa mix from the " +
  "south yard plant. Three trucks delivered roughly forty five cubic " +
  "metres total and the pump line ran without any blockages. After " +
  "lunch the finishing crew began steel trowelling the slab while the " +
  "rebar team prepped the next bay. No safety incidents to report and " +
  "the inspector signed off on the pour at the end of the shift.";

export async function transcribeAudio(audioUri: string): Promise<TranscribeResult> {
  // Fixture mode: return mock transcript inline
  if (env.EXPO_PUBLIC_USE_FIXTURES) {
    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 500));
    return { transcript: FIXTURE_TRANSCRIPT, durationSeconds: 42 };
  }

  // Read audio file as blob
  const response = await fetch(audioUri);
  const blob = await response.blob();

  // Call edge function
  const formData = new FormData();
  formData.append("audio", blob, "voice-note.m4a");

  const { data, error } = await supabase.functions.invoke("transcribe-audio", {
    body: formData,
  });

  if (error) {
    throw new Error(`Transcription failed: ${error.message}`);
  }

  const parsed = transcribeResponseSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(`Invalid transcription response: ${parsed.error.message}`);
  }

  return {
    transcript: parsed.data.transcript,
    durationSeconds: parsed.data.durationSeconds,
  };
}
