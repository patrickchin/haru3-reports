/**
 * Fixture staleness check.
 *
 * Computes the SHA-256 of the live SYSTEM_PROMPT + schema snapshot and
 * compares it against fixtures/prompt-version.json. Fails when:
 *   - prompt-version.json is missing
 *   - the recorded hash differs from the live hash
 *
 * Runs in CI on PRs that touch index.ts / report-schema.ts / sample-notes.ts
 * to enforce that fixtures are refreshed in the same PR as prompt/schema
 * changes.
 *
 * Locally, run with:
 *   deno run --allow-env --allow-read \
 *     supabase/functions/generate-report/check-fixture-staleness.ts
 */

import { SYSTEM_PROMPT, EMPTY_REPORT } from "./index.ts";
import { sha256, loadPromptVersion } from "./fixtures-loader.ts";

const schemaSnapshot = JSON.stringify(EMPTY_REPORT);
const liveHash = await sha256(SYSTEM_PROMPT + "::" + schemaSnapshot);

const recorded = await loadPromptVersion();
if (!recorded) {
  console.error(
    "❌ fixtures/prompt-version.json is missing — run capture-fixtures.ts " +
    "(or --rebuild-parsed) to generate it.",
  );
  Deno.exit(2);
}

if (recorded.systemPromptHash !== liveHash) {
  console.error(
    "❌ Fixture staleness detected.\n" +
    `   recorded hash: ${recorded.systemPromptHash.slice(0, 12)}…\n` +
    `   live hash:     ${liveHash.slice(0, 12)}…\n\n` +
    "Refresh fixtures with one of:\n" +
    "  • Trigger the 'Capture LLM Fixtures' workflow (workflow_dispatch)\n" +
    "  • Locally with provider keys:\n" +
    "      AI_PROVIDER=kimi MOONSHOT_API_KEY=… deno run \\\n" +
    "        --allow-env --allow-net --allow-read --allow-write \\\n" +
    "        supabase/functions/generate-report/capture-fixtures.ts\n" +
    "  • Parser/schema-only changes (no LLM needed):\n" +
    "      deno run --allow-env --allow-read --allow-write \\\n" +
    "        supabase/functions/generate-report/capture-fixtures.ts \\\n" +
    "        --rebuild-parsed",
  );
  Deno.exit(1);
}

console.log(
  `✅ Fixtures match current prompt + schema (hash ${liveHash.slice(0, 12)}…)`,
);
