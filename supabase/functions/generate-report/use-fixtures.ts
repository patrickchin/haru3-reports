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

/**
 * Embedded fallback fixture for the edge runtime, where the compiled bundle
 * does not include the raw fixture files on disk.
 */
const EMBEDDED_QUIET_DAY_RAW = '{"report":{"meta":{"title":"Quiet Day \u2014 Cleanup & Prep","reportType":"daily","summary":"Light activity on site with cleanup, safety checks, and prep for next week\'s deliveries.","visitDate":null},"weather":{"conditions":"sunny","temperature":"24\u00b0C","wind":"no wind","impact":null},"workers":{"totalWorkers":2,"workerHours":null,"notes":"Site lead plus one labourer.","roles":[{"role":"Site lead","count":1,"notes":null},{"role":"Labourer","count":1,"notes":"Cleanup and prep"}]},"materials":[{"name":"Bricks","quantity":"3","quantityUnit":"pallets","condition":null,"status":"scheduled","notes":"Delivery booked for tomorrow morning by 8am"}],"issues":[{"title":"Loose safety mesh on west scaffolding","category":"safety","severity":"low","status":"resolved","details":"Safety mesh on the west scaffolding had come loose.","actionRequired":"Mesh re-tied properly on site.","sourceNoteIndexes":[5]}],"nextSteps":["Receive 3 pallets of bricks tomorrow morning by 8am","Send progress photos in client update"],"sections":[{"title":"Site Activity","content":"Quiet day on site \u2014 primarily waiting on materials. Site lead plus one labourer carried out cleanup and prep for next week.","sourceNoteIndexes":[1,3]},{"title":"Cleanup","content":"Swept out the ground floor and stacked offcuts into the skip.","sourceNoteIndexes":[4]},{"title":"Safety Checks","content":"Re-tied loose safety mesh on the west scaffolding. Checked all fire extinguishers \u2014 4 on the ground floor and 2 on level 1, all in date.","sourceNoteIndexes":[5,6]},{"title":"Client Update","content":"Captured progress photos of the north elevation, south elevation, and car park area for the client update.","sourceNoteIndexes":[7]},{"title":"Deliveries","content":"3 pallets of bricks scheduled for tomorrow morning, expected by 8am. Laydown area cleared and witches hats placed to guide the driver.","sourceNoteIndexes":[8,9]}]}}';

let cachedFixtures: HappyFixture[] | null = null;

async function getFixtures(): Promise<HappyFixture[]> {
  if (cachedFixtures) return cachedFixtures;
  try {
    cachedFixtures = await loadAllHappyFixtures();
  } catch (err) {
    console.warn(
      `[USE_FIXTURES] Failed to load fixtures from disk (${
        err instanceof Error ? err.message : String(err)
      }). Using embedded fallback.`,
    );
    cachedFixtures = [];
  }
  if (cachedFixtures.length === 0) {
    // Edge runtime can't read fixture files — use embedded fallback.
    // Only rawText is used by fixturesGenerateTextFn; parsed is unused at runtime.
    cachedFixtures = [{
      name: FALLBACK_FIXTURE_NAME,
      input: { notes: ["fallback"] },
      rawText: EMBEDDED_QUIET_DAY_RAW,
      parsed: null as unknown as HappyFixture["parsed"],
    }];
    console.log("[USE_FIXTURES] Loaded embedded quiet-day fallback fixture.");
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

  let match = matchHappyFixture(fixtures, notes);
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

  // Simulate realistic LLM latency so loading states are exercised in
  // local Maestro / manual fixture-mode runs. Tests override to 0 via
  // `FIXTURES_DELAY_MS=0` to keep the deno suite fast.
  await sleepFromEnv("FIXTURES_DELAY_MS", DEFAULT_FIXTURES_DELAY_MS);

  return {
    text: match.rawText,
    usage: { inputTokens: 0, outputTokens: 0, cachedTokens: 0 },
  };
};

const DEFAULT_FIXTURES_DELAY_MS = 5000;

async function sleepFromEnv(name: string, defaultMs: number): Promise<void> {
  const raw = Deno.env.get(name);
  const ms = raw === undefined ? defaultMs : Number.parseInt(raw, 10);
  if (!Number.isFinite(ms) || ms <= 0) return;
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/**
 * Recover the notes array from the rendered user prompt. `formatNotes` joins
 * notes as `[1] foo\n[2] bar\n…`; we reverse that with a per-line regex so
 * we can match against fixture inputs.
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
