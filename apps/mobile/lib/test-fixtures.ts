/**
 * Mobile-side LLM fixture loader.
 *
 * Reads fixtures captured by
 * `supabase/functions/generate-report/capture-fixtures.ts` and returns them
 * shaped like the edge-function response, so they can be plugged into
 * `backend.functions.invoke` mocks in vitest tests.
 *
 * Fixture file layout (see supabase/functions/generate-report/fixtures/README.md):
 *
 *   happy/<name>.input.json    — the original generate-report request
 *   happy/<name>.raw.txt       — raw LLM text (unused on mobile side)
 *   happy/<name>.parsed.json   — GenerateResult after parseAndApplyReport
 *
 * The edge function's POST handler returns:
 *
 *   { report: result.report.report, usage, systemPrompt, userPrompt }
 *
 * (note the unwrapped inner `report`). This loader applies the same shape
 * change so a fixture is a drop-in mock of the network response.
 *
 * Vitest is configured to run with `environment: 'node'`, so we use Node's
 * `fs/promises` here.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// apps/mobile/lib/test-fixtures.ts → repo root → fixtures dir
const FIXTURES_ROOT = path.resolve(
  __dirname,
  "..",
  "..",
  "..",
  "supabase",
  "functions",
  "generate-report",
  "fixtures",
);

const HAPPY_DIR = path.join(FIXTURES_ROOT, "happy");

export interface CapturedFixture {
  name: string;
  /** Original notes / existingReport that produced the fixture. */
  input: { notes: string[]; existingReport?: unknown; lastProcessedNoteCount?: number };
  /** Edge-function-shaped response: drop straight into `backend.functions.invoke` mock data. */
  response: {
    report: unknown;
    usage: unknown;
    systemPrompt?: string;
    userPrompt?: string;
  };
}

export async function listFixtureNames(): Promise<string[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(HAPPY_DIR);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  return entries
    .filter((f) => f.endsWith(".input.json"))
    .map((f) => f.slice(0, -".input.json".length))
    .sort();
}

export async function loadFixture(name: string): Promise<CapturedFixture> {
  const inputPath = path.join(HAPPY_DIR, `${name}.input.json`);
  const parsedPath = path.join(HAPPY_DIR, `${name}.parsed.json`);
  const [inputJson, parsedJson] = await Promise.all([
    fs.readFile(inputPath, "utf8"),
    fs.readFile(parsedPath, "utf8"),
  ]);
  const input = JSON.parse(inputJson) as CapturedFixture["input"];
  const parsed = JSON.parse(parsedJson) as {
    report: { report: unknown };
    usage: unknown;
    systemPrompt?: string;
    userPrompt?: string;
  };
  return {
    name,
    input,
    response: {
      // Mirror createHandler's response shape: the inner `report` is unwrapped.
      report: parsed.report.report,
      usage: parsed.usage ?? null,
      systemPrompt: parsed.systemPrompt,
      userPrompt: parsed.userPrompt,
    },
  };
}

export async function loadAllFixtures(): Promise<CapturedFixture[]> {
  const names = await listFixtureNames();
  return Promise.all(names.map(loadFixture));
}
