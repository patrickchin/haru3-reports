/**
 * USE_FIXTURES handler shim for summarize-voice-note.
 *
 * Returns a deterministic captured response so local Maestro / `pnpm
 * ios:mock` runs work without provider API keys.
 *
 * Unlike `generate-report` we don't bother matching transcripts — there's
 * one canned summary that fits any input, since the goal of fixtures is to
 * exercise the UI plumbing, not to produce content-accurate summaries.
 */
import type { GenerateTextFn } from "../_shared/llm.ts";

const EMBEDDED_HAPPY_RAW =
  '{"title":"Site walkthrough notes","summary":"The team completed the ground floor concrete pour using a 40 MPa mix. Three trucks delivered roughly 45 cubic metres total. No issues with the pump line. The finishing crew started steel trowelling shortly after lunch."}';

const DEFAULT_FIXTURES_DELAY_MS = 5000;

async function sleepFromEnv(name: string, defaultMs: number): Promise<void> {
  const raw = Deno.env.get(name);
  const ms = raw === undefined ? defaultMs : Number.parseInt(raw, 10);
  if (!Number.isFinite(ms) || ms <= 0) return;
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export function fixturesGetModelFn(provider: string, modelId?: string) {
  return {
    instance: { __fixture: true, provider, modelId } as const,
    modelId: modelId ?? `${provider}-fixture`,
  };
}

export const fixturesGenerateTextFn: GenerateTextFn = async () => {
  await sleepFromEnv("FIXTURES_DELAY_MS", DEFAULT_FIXTURES_DELAY_MS);
  return {
    text: EMBEDDED_HAPPY_RAW,
    usage: { inputTokens: 0, outputTokens: 0, cachedTokens: 0 },
  };
};
