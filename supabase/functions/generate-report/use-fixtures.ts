/**
 * USE_FIXTURES handler shim.
 *
 * When the edge function is started with USE_FIXTURES=true (e.g. for local
 * Maestro E2E runs against `supabase functions serve`), this module supplies
 * `generateTextFn` and `getModelFn` implementations that read raw LLM
 * responses from `fixtures/happy/<name>.raw.txt` instead of calling the real
 * provider.
 *
 * This means:
 *   - No provider API keys are required
 *   - No outbound network calls to LLM providers
 *   - Maestro sees deterministic, realistic LLM output every run
 *
 * Matching strategy: by note count + first-note prefix (see
 * matchHappyFixture). Falls back to `quiet-day` if no match is found, with
 * a console.warn so mismatches are loud.
 */

import type { GenerateTextFn } from "../_shared/llm.ts";
import {
  loadAllHappyFixtures,
  matchHappyFixture,
  type HappyFixture,
} from "./fixtures-loader.ts";

const FALLBACK_FIXTURE_NAME = "quiet-day";

let cachedFixtures: HappyFixture[] | null = null;

async function getFixtures(): Promise<HappyFixture[]> {
  if (cachedFixtures) return cachedFixtures;
  cachedFixtures = await loadAllHappyFixtures();
  if (cachedFixtures.length === 0) {
    throw new Error(
      "USE_FIXTURES=true but fixtures/happy/ is empty. " +
      "Run capture-fixtures.ts to populate it.",
    );
  }
  return cachedFixtures;
}

export function isFixturesModeEnabled(): boolean {
  return Deno.env.get("USE_FIXTURES") === "true";
}

/**
 * Returns a sentinel model handle. `fetchReportFromLLM` only reads .instance
 * and .modelId off this object, so a plain marker is enough.
 */
export function fixturesGetModelFn(provider: string, modelId?: string) {
  return {
    instance: { __fixture: true, provider, modelId } as const,
    modelId: modelId ?? `${provider}-fixture`,
  };
}

/**
 * Returns a generateTextFn that resolves with the raw text of a captured
 * fixture matching the incoming notes.
 *
 * The user prompt is parsed back to recover the notes (see
 * `buildPrompt` in index.ts). Falls back to FALLBACK_FIXTURE_NAME on any
 * mismatch, logging a warning so unmatched test inputs are visible.
 */
export const fixturesGenerateTextFn: GenerateTextFn = async (request) => {
  const fixtures = await getFixtures();
  const notes = parseNotesFromUserPrompt(request.prompt);
  // Detect whether the request was made with an existing (non-empty) report.
  // The empty base report stringifies to a small fixed prefix; anything
  // longer indicates the caller passed an existingReport.
  const hasExisting = hasNonEmptyCurrentReport(request.prompt);

  let match = matchHappyFixture(fixtures, notes, hasExisting ? {} : undefined);
  if (!match) {
    match = fixtures.find((f) => f.name === FALLBACK_FIXTURE_NAME) ??
      fixtures[0];
    console.warn(
      `[USE_FIXTURES] No fixture matched (${notes.length} notes, ` +
      `first="${notes[0]?.slice(0, 40) ?? ""}"). ` +
      `Falling back to "${match.name}".`,
    );
  } else {
    console.log(
      `[USE_FIXTURES] Matched fixture "${match.name}" ` +
      `(${notes.length} notes).`,
    );
  }

  return {
    text: match.rawText,
    usage: { inputTokens: 0, outputTokens: 0, cachedTokens: 0 },
  };
};

/**
 * Returns true when the rendered user prompt's CURRENT REPORT block contains
 * non-empty data (i.e. the caller passed an existingReport). The empty
 * baseline produces a known short prefix; we compare against a length cutoff
 * so this stays robust to harmless serialization changes.
 */
function hasNonEmptyCurrentReport(prompt: string): boolean {
  const match = /CURRENT REPORT:\n(\{[^\n]*)/.exec(prompt);
  if (!match) return false;
  const reportLine = match[1];
  // Empty EMPTY_REPORT serialised by compactReplacer is short
  // (e.g. `{"report":{"meta":{"reportType":"site_visit"}}}`). Anything
  // substantially longer must contain real content.
  return reportLine.length > 80;
}

/**
 * Recover the notes array from the rendered user prompt. `formatNotes` joins
 * notes as `[1] foo\n[2] bar\n…`; we reverse that with a per-line regex so
 * we can match against fixture inputs. Tolerant of incremental prompts that
 * include both a CURRENT REPORT block and NEW NOTES.
 */
export function parseNotesFromUserPrompt(prompt: string): string[] {
  // Walk lines. A note line starts with `[N] `. Continuation lines (LLM input
  // is single-line per note in formatNotes, but be defensive) are appended.
  const lines = prompt.split("\n");
  const notes: string[] = [];
  let current: string | null = null;
  for (const raw of lines) {
    const line = raw;
    const m = /^\[(\d+)\]\s(.*)$/.exec(line);
    if (m) {
      if (current !== null) notes.push(current);
      current = m[2];
    } else if (current !== null) {
      current += "\n" + line;
    }
  }
  if (current !== null) notes.push(current);
  return notes;
}
