/**
 * Shared loader for LLM fixtures.
 *
 * Used by:
 *   - index.fixtures.test.ts   (replays raw fixtures through parseLLMReport)
 *   - createHandler USE_FIXTURES mode (serves fixtures instead of calling LLM)
 *   - capture-fixtures.ts      (writes fixtures)
 *
 * Fixture files are siblings of this module, under fixtures/.
 */

import type { GenerateResult } from "./index.ts";

export type FixtureSampleName = string;

export interface HappyFixture {
  name: FixtureSampleName;
  input: HappyFixtureInput;
  rawText: string;
  parsed: GenerateResult;
}

export interface HappyFixtureInput {
  notes: string[];
}

export interface ErrorFixture {
  name: string;
  rawText: string;
  expected: ErrorFixtureExpectation;
}

/**
 * What the parser should do with this raw text. The fixture-driven tests use
 * this to assert correct error handling without hard-coding behaviour in the
 * test file itself.
 */
export type ErrorFixtureExpectation =
  | { kind: "throws"; errorName: "LLMParseError" }
  | { kind: "succeeds"; note?: string }; // tolerated despite weirdness

export interface PromptVersion {
  systemPromptHash: string;
  schemaVersion: string;
  capturedAt: string;
  provider: string;
  model: string;
}

export interface ErrorManifestEntry {
  name: string;
  description: string;
  expected: ErrorFixtureExpectation;
}

const FIXTURES_DIR = new URL("./fixtures/", import.meta.url);
const HAPPY_DIR = new URL("./happy/", FIXTURES_DIR);
const ERRORS_DIR = new URL("./errors/", FIXTURES_DIR);

export function fixturesDir(): URL {
  return FIXTURES_DIR;
}

export function happyDir(): URL {
  return HAPPY_DIR;
}

export function errorsDir(): URL {
  return ERRORS_DIR;
}

// ── Hashing ────────────────────────────────────────────────────────────────

/**
 * SHA-256 of a string, hex-encoded. Used to detect prompt drift so tests can
 * warn when fixtures are stale.
 */
export async function sha256(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const arr = Array.from(new Uint8Array(digest));
  return arr.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ── Listing ────────────────────────────────────────────────────────────────

export async function listHappyFixtureNames(): Promise<string[]> {
  const names: string[] = [];
  try {
    for await (const entry of Deno.readDir(HAPPY_DIR)) {
      if (entry.isFile && entry.name.endsWith(".input.json")) {
        names.push(entry.name.slice(0, -".input.json".length));
      }
    }
  } catch (err) {
    if (!(err instanceof Deno.errors.NotFound)) throw err;
  }
  names.sort();
  return names;
}

// ── Loading ────────────────────────────────────────────────────────────────

export async function loadHappyFixture(name: string): Promise<HappyFixture> {
  const inputUrl = new URL(`${name}.input.json`, HAPPY_DIR);
  const rawUrl = new URL(`${name}.raw.txt`, HAPPY_DIR);
  const parsedUrl = new URL(`${name}.parsed.json`, HAPPY_DIR);

  const [inputText, rawText, parsedText] = await Promise.all([
    Deno.readTextFile(inputUrl),
    Deno.readTextFile(rawUrl),
    Deno.readTextFile(parsedUrl),
  ]);

  return {
    name,
    input: JSON.parse(inputText) as HappyFixtureInput,
    rawText,
    parsed: JSON.parse(parsedText) as GenerateResult,
  };
}

export async function loadAllHappyFixtures(): Promise<HappyFixture[]> {
  const names = await listHappyFixtureNames();
  return Promise.all(names.map(loadHappyFixture));
}

export async function loadErrorManifest(): Promise<ErrorManifestEntry[]> {
  const manifestUrl = new URL("MANIFEST.json", ERRORS_DIR);
  const text = await Deno.readTextFile(manifestUrl);
  return JSON.parse(text) as ErrorManifestEntry[];
}

export async function loadErrorFixture(name: string): Promise<ErrorFixture> {
  const manifest = await loadErrorManifest();
  const entry = manifest.find((m) => m.name === name);
  if (!entry) {
    throw new Error(
      `Unknown error fixture "${name}" — not in errors/MANIFEST.json`,
    );
  }
  const rawUrl = new URL(`${name}.raw.txt`, ERRORS_DIR);
  const rawText = await Deno.readTextFile(rawUrl);
  return { name, rawText, expected: entry.expected };
}

export async function loadAllErrorFixtures(): Promise<ErrorFixture[]> {
  const manifest = await loadErrorManifest();
  return Promise.all(manifest.map((m) => loadErrorFixture(m.name)));
}

export async function loadPromptVersion(): Promise<PromptVersion | null> {
  try {
    const text = await Deno.readTextFile(
      new URL("prompt-version.json", FIXTURES_DIR),
    );
    return JSON.parse(text) as PromptVersion;
  } catch (err) {
    if (err instanceof Deno.errors.NotFound) return null;
    throw err;
  }
}

// ── Input matching (used by USE_FIXTURES mode) ────────────────────────────

/**
 * Match an incoming generate-report request against the captured happy
 * fixtures. Returns the best match or null if none look close.
 *
 * Matching strategy: exact note count + exact first-note prefix. Falls back
 * to first-note prefix only when no exact count match exists.
 */
export function matchHappyFixture(
  fixtures: HappyFixture[],
  notes: readonly string[],
): HappyFixture | null {
  if (notes.length === 0 || fixtures.length === 0) return null;
  const firstNote = notes[0]?.slice(0, 60).toLowerCase() ?? "";

  const exact = fixtures.find(
    (f) =>
      f.input.notes.length === notes.length &&
      (f.input.notes[0]?.slice(0, 60).toLowerCase() ?? "") === firstNote,
  );
  if (exact) return exact;

  const prefixOnly = fixtures.find(
    (f) =>
      (f.input.notes[0]?.slice(0, 30).toLowerCase() ?? "") ===
        firstNote.slice(0, 30),
  );
  return prefixOnly ?? null;
}
