/**
 * Capture LLM fixtures.
 *
 * Calls the real LLM through `fetchReportFromLLM` (the same code path used by
 * the production edge function) for every sample in `sample-notes.ts` and
 * writes:
 *
 *   fixtures/happy/<name>.input.json   — the request that produced this fixture
 *   fixtures/happy/<name>.raw.txt      — raw LLM text response, pre-parse
 *   fixtures/happy/<name>.parsed.json  — final GenerateResult after parsing
 *
 * Plus `fixtures/prompt-version.json` recording the SHA-256 of SYSTEM_PROMPT
 * so tests can warn when fixtures are stale relative to the live prompt.
 *
 * Usage:
 *   AI_PROVIDER=kimi MOONSHOT_API_KEY=… \
 *     deno run --allow-env --allow-net --allow-read --allow-write \
 *     supabase/functions/generate-report/capture-fixtures.ts
 *
 *   # one sample only
 *   … capture-fixtures.ts quiet-day
 *
 *   # list available samples
 *   … capture-fixtures.ts --list
 *
 *   # rebuild *.parsed.json from the existing *.raw.txt without calling the LLM.
 *   # Use after parser/schema changes to refresh parsed snapshots offline.
 *   … capture-fixtures.ts --rebuild-parsed
 */

import {
  fetchReportFromLLM,
  parseAndApplyReport,
  SYSTEM_PROMPT,
  EMPTY_REPORT,
} from "./index.ts";
import * as samples from "./sample-notes.ts";
import {
  fixturesDir,
  happyDir,
  sha256,
  type HappyFixtureInput,
} from "./fixtures-loader.ts";

const SAMPLES: Record<string, string[]> = {
  "commercial-build-day": samples.COMMERCIAL_BUILD_DAY,
  "resi-renovation": samples.RESI_RENOVATION,
  "road-works": samples.ROAD_WORKS,
  "highrise-pour": samples.HIGHRISE_POUR,
  "interior-fitout": samples.INTERIOR_FITOUT,
  "quiet-day": samples.QUIET_DAY,
  "messy-transcription": samples.MESSY_TRANSCRIPTION,
  "rambling-notes": samples.RAMBLING_NOTES,
  "technical-notes": samples.TECHNICAL_NOTES,
  "materials-heavy-day": samples.MATERIALS_HEAVY_DAY,
  "equipment-heavy-day": samples.EQUIPMENT_HEAVY_DAY,
  "delivery-tracking-day": samples.DELIVERY_TRACKING_DAY,
  "plant-intensive-day": samples.PLANT_INTENSIVE_DAY,
  "materials-quality-issues": samples.MATERIALS_QUALITY_ISSUES,
  "warehouse-build": samples.WAREHOUSE_BUILD,
  "earthworks-day": samples.EARTHWORKS_DAY,
};

const arg = Deno.args[0];

if (arg === "--list") {
  console.log("Available samples:");
  for (const name of Object.keys(SAMPLES)) console.log(`  ${name}`);
  Deno.exit(0);
}

const provider = (Deno.env.get("AI_PROVIDER") ?? "kimi").toLowerCase();

// ── --rebuild-parsed mode ─────────────────────────────────────────────────
//
// Re-derives <name>.parsed.json from the existing <name>.raw.txt for every
// happy fixture, without calling the LLM. Used after parser/schema changes to
// refresh snapshots offline.
if (arg === "--rebuild-parsed") {
  await Deno.mkdir(happyDir(), { recursive: true });
  const names: string[] = [];
  for await (const entry of Deno.readDir(happyDir())) {
    if (entry.isFile && entry.name.endsWith(".raw.txt")) {
      names.push(entry.name.slice(0, -".raw.txt".length));
    }
  }
  names.sort();
  console.log(`Rebuilding parsed.json for ${names.length} fixture(s)…\n`);

  let rebuilt = 0;
  let rebuildFailed = 0;
  for (const name of names) {
    const label = name.padEnd(26);
    try {
      const rawText = await Deno.readTextFile(
        new URL(`${name}.raw.txt`, happyDir()),
      );
      const parsed = parseAndApplyReport({
        text: rawText,
        usage: null,
        provider: "fixture",
        model: "fixture",
        base: EMPTY_REPORT,
        systemPrompt: SYSTEM_PROMPT,
        userPrompt: "",
      });
      await Deno.writeTextFile(
        new URL(`${name}.parsed.json`, happyDir()),
        JSON.stringify(parsed, null, 2) + "\n",
      );
      console.log(
        `✅ ${label} → ${parsed.report.report.sections.length} sections, ` +
        `${parsed.report.report.materials.length} materials, ` +
        `${parsed.report.report.issues.length} issues`,
      );
      rebuilt++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`❌ ${label} FAILED: ${msg}`);
      rebuildFailed++;
    }
  }
  console.log(
    `\nDone. Rebuilt ${rebuilt} fixture(s), ${rebuildFailed} failure(s).`,
  );

  // Update only the prompt hash; preserve capturedAt / provider / model from
  // the previous full capture so we don't pretend a parser-only refresh was a
  // fresh LLM capture.
  const schemaSnapshot = JSON.stringify(EMPTY_REPORT);
  const promptHash = await sha256(SYSTEM_PROMPT + "::" + schemaSnapshot);
  let existing: Record<string, unknown> = {};
  try {
    existing = JSON.parse(
      await Deno.readTextFile(new URL("prompt-version.json", fixturesDir())),
    );
  } catch (_err) {
    // First-time bootstrap.
  }
  await Deno.writeTextFile(
    new URL("prompt-version.json", fixturesDir()),
    JSON.stringify(
      {
        ...existing,
        systemPromptHash: promptHash,
        schemaVersion: "v1",
        rebuiltAt: new Date().toISOString(),
      },
      null,
      2,
    ) + "\n",
  );

  if (rebuildFailed > 0) Deno.exit(1);
  Deno.exit(0);
}

const toRun: Array<[string, string[]]> = arg
  ? [[arg, SAMPLES[arg]]].filter(([, n]) => {
      if (!n) {
        console.error(
          `Unknown sample "${arg}". Use --list to see available samples.`,
        );
        Deno.exit(1);
      }
      return true;
    }) as Array<[string, string[]]>
  : Object.entries(SAMPLES);

await Deno.mkdir(happyDir(), { recursive: true });

console.log(`Capturing fixtures with provider: ${provider}\n`);

let captured = 0;
let failed = 0;
let lastModelId = "unknown";

for (const [name, notes] of toRun) {
  const label = name.padEnd(26);
  const input: HappyFixtureInput = { notes };
  try {
    console.log(`⏳ ${label} (${notes.length} notes)…`);
    const raw = await fetchReportFromLLM(notes, { provider });
    const parsed = parseAndApplyReport(raw);
    lastModelId = parsed.model || lastModelId;

    await Deno.writeTextFile(
      new URL(`${name}.input.json`, happyDir()),
      JSON.stringify(input, null, 2) + "\n",
    );
    await Deno.writeTextFile(
      new URL(`${name}.raw.txt`, happyDir()),
      raw.text,
    );
    await Deno.writeTextFile(
      new URL(`${name}.parsed.json`, happyDir()),
      JSON.stringify(parsed, null, 2) + "\n",
    );

    console.log(
      `✅ ${label} → ${parsed.report.report.sections.length} sections, ` +
      `${parsed.report.report.materials.length} materials, ` +
      `${parsed.report.report.issues.length} issues`,
    );
    captured++;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`❌ ${label} FAILED: ${msg}`);
    failed++;
  }
}

// Always (re)write prompt-version.json so staleness checks are accurate.
const schemaSnapshot = JSON.stringify(EMPTY_REPORT);
const promptHash = await sha256(SYSTEM_PROMPT + "::" + schemaSnapshot);
await Deno.writeTextFile(
  new URL("prompt-version.json", fixturesDir()),
  JSON.stringify(
    {
      systemPromptHash: promptHash,
      schemaVersion: "v1",
      capturedAt: new Date().toISOString(),
      provider,
      model: lastModelId,
    },
    null,
    2,
  ) + "\n",
);

console.log(
  `\nDone. Captured ${captured} fixture(s), ${failed} failure(s). ` +
  `Prompt hash: ${promptHash.slice(0, 12)}…`,
);

if (failed > 0) Deno.exit(1);
