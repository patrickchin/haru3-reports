/**
 * Runs sample note sets through generateReportFromNotes and writes
 * the results as individual JSON files into
 * backend/functions/generate-report/reports/.
 *
 * Usage:
 *   set -a; source backend/.env; set +a
 *   
 *   # Run all samples:
 *   deno run --allow-env --allow-net --allow-read --allow-write backend/functions/generate-report/run-all-samples.ts
 *   
 *   # Run one sample:
 *   deno run --allow-env --allow-net --allow-read --allow-write backend/functions/generate-report/run-all-samples.ts quiet-day
 *   
 *   # List available samples:
 *   deno run --allow-env --allow-net --allow-read --allow-write backend/functions/generate-report/run-all-samples.ts --list
 */

import { generateReportFromNotes } from "./index.ts";
import {
  COMMERCIAL_BUILD_DAY,
  RESI_RENOVATION,
  ROAD_WORKS,
  HIGHRISE_POUR,
  INTERIOR_FITOUT,
  QUIET_DAY,
  MESSY_TRANSCRIPTION,
  RAMBLING_NOTES,
  TECHNICAL_NOTES,
  MATERIALS_HEAVY_DAY,
  EQUIPMENT_HEAVY_DAY,
  DELIVERY_TRACKING_DAY,
  PLANT_INTENSIVE_DAY,
  MATERIALS_QUALITY_ISSUES,
  WAREHOUSE_BUILD,
  EARTHWORKS_DAY,
} from "./sample-notes.ts";

const samples: Record<string, string[]> = {
  "commercial-build-day": COMMERCIAL_BUILD_DAY,
  "resi-renovation": RESI_RENOVATION,
  "road-works": ROAD_WORKS,
  "highrise-pour": HIGHRISE_POUR,
  "interior-fitout": INTERIOR_FITOUT,
  "quiet-day": QUIET_DAY,
  "messy-transcription": MESSY_TRANSCRIPTION,
  "rambling-notes": RAMBLING_NOTES,
  "technical-notes": TECHNICAL_NOTES,
  "materials-heavy-day": MATERIALS_HEAVY_DAY,
  "equipment-heavy-day": EQUIPMENT_HEAVY_DAY,
  "delivery-tracking-day": DELIVERY_TRACKING_DAY,
  "plant-intensive-day": PLANT_INTENSIVE_DAY,
  "materials-quality-issues": MATERIALS_QUALITY_ISSUES,
  "warehouse-build": WAREHOUSE_BUILD,
  "earthworks-day": EARTHWORKS_DAY,
};

const outDir = new URL("./reports", import.meta.url).pathname;
await Deno.mkdir(outDir, { recursive: true });

const provider = (Deno.env.get("AI_PROVIDER") ?? "kimi").toLowerCase();
const arg = Deno.args[0];

// Handle --list flag
if (arg === "--list") {
  console.log("Available samples:");
  for (const name of Object.keys(samples)) {
    console.log(`  ${name}`);
  }
  Deno.exit(0);
}

// Filter to single sample if specified
const samplesToRun = arg
  ? [[arg, samples[arg]] as const].filter(([, notes]) => {
      if (!notes) {
        console.error(`Unknown sample: ${arg}`);
        console.error("Use --list to see available samples");
        Deno.exit(1);
      }
      return true;
    })
  : Object.entries(samples);

console.log(`Using provider: ${provider}\n`);

for (const [name, notes] of samplesToRun) {
  const label = name.padEnd(24);
  try {
    console.log(`⏳ ${label} (${notes.length} notes)…`);
    const result = await generateReportFromNotes(notes, { provider });
    const jsonPath = `${outDir}/${name}.json`;
    await Deno.writeTextFile(jsonPath, JSON.stringify(result, null, 2));
    console.log(
      `✅ ${label} → reports/${name}.json  (${result.report.activities.length} activities, ${result.report.sections.length} sections)`,
    );
  } catch (err) {
    console.error(`❌ ${label} FAILED: ${err}`);
  }
}

console.log("\nDone.");
