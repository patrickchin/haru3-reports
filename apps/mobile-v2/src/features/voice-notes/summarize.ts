/**
 * Summarize voice note transcript via summarize-voice-note edge function.
 *
 * Inline fixture mode per design-principles.md §4.
 */
import { supabase } from "@/infra/supabase";
import { env } from "@/infra/env";
import { z } from "zod";

const summarizeResponseSchema = z.object({
  title: z.string(),
  summary: z.string(),
});

export type SummarizeResult = {
  title: string;
  summary: string;
};

const FIXTURE_SUMMARY = {
  title: "Concrete Pour Completion",
  summary:
    "Ground floor concrete pour completed successfully with 45 cubic metres delivered. " +
    "Finishing crew began steel trowelling after lunch. Inspector approved the work. No safety incidents.",
};

export async function summarizeVoiceNote(
  fileId: string,
  transcript: string
): Promise<SummarizeResult> {
  // Fixture mode: return mock summary inline
  if (env.EXPO_PUBLIC_USE_FIXTURES) {
    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 800));
    return FIXTURE_SUMMARY;
  }

  // Call edge function
  const { data, error } = await supabase.functions.invoke("summarize-voice-note", {
    body: { fileId, transcript },
  });

  if (error) {
    throw new Error(`Summarization failed: ${error.message}`);
  }

  const parsed = summarizeResponseSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(`Invalid summarization response: ${parsed.error.message}`);
  }

  return parsed.data;
}
