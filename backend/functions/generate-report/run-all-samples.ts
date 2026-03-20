/**
 * Runs every sample note set through generateReportFromNotes and writes
 * the results as individual JSON and markdown files into
 * backend/functions/generate-report/reports/.
 *
 * Usage:
 *   set -a; source backend/.env; set +a
 *   deno run --allow-env --allow-net --allow-read --allow-write backend/functions/generate-report/run-all-samples.ts
 */

import { generateReportFromNotes } from "./index.ts";
import type { GeneratedSiteReport } from "./report-schema.ts";
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

function toMarkdown(
  name: string,
  noteCount: number,
  result: GeneratedSiteReport,
): string {
  const lines: string[] = [];
  const title = name
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

  lines.push(`# ${result.report.meta.title || title}\n`);
  lines.push(`> Generated from ${noteCount} field notes\n`);
  lines.push(`> Report type: ${result.report.meta.reportType}\n`);

  if (result.report.meta.summary) {
    lines.push(`${result.report.meta.summary}\n`);
  }

  if (result.report.activities.length > 0) {
    lines.push("## Activities\n");
    for (const activity of result.report.activities) {
      lines.push(`### ${activity.name}\n`);
      lines.push(`- Status: ${activity.status}`);
      if (activity.location) {
        lines.push(`- Location: ${activity.location}`);
      }
      lines.push(`- Summary: ${activity.summary}`);
      if (activity.observations.length > 0) {
        lines.push(`- Observations: ${activity.observations.join("; ")}`);
      }
      lines.push("");
    }
  }

  for (const { title: sectionTitle, content } of result.report.sections) {
    lines.push(`## ${sectionTitle}\n`);
    lines.push(`${content}\n`);
  }

  return lines.join("\n");
}

const outDir = new URL("./reports", import.meta.url).pathname;
await Deno.mkdir(outDir, { recursive: true });

const provider = (Deno.env.get("AI_PROVIDER") ?? "kimi").toLowerCase();
console.log(`Using provider: ${provider}\n`);

for (const [name, notes] of Object.entries(samples)) {
  const label = name.padEnd(24);
  try {
    console.log(`⏳ ${label} (${notes.length} notes)…`);
    const result = await generateReportFromNotes(notes, { provider });
    const md = toMarkdown(name, notes.length, result);
    const markdownPath = `${outDir}/${name}.md`;
    const jsonPath = `${outDir}/${name}.json`;
    await Deno.writeTextFile(markdownPath, md);
    await Deno.writeTextFile(jsonPath, JSON.stringify(result, null, 2));
    console.log(
      `✅ ${label} → reports/${name}.json + reports/${name}.md  (${result.report.activities.length} activities, ${result.report.sections.length} sections)`,
    );
  } catch (err) {
    console.error(`❌ ${label} FAILED: ${err}`);
  }
}

console.log("\nDone.");
