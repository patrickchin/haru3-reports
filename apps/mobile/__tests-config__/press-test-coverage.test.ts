/**
 * Gate enforcing the rules documented in `press-test-catalog.ts`.
 *
 * Runs entirely on the static source tree — no React, no Vitest renderers.
 * It walks the relevant directories, extracts every `testID="btn-..."` it
 * finds, and cross-references with the catalog and the test/Maestro corpora.
 *
 * Failure modes:
 *   - **Orphan**: a button rendered in source is not in the catalog.
 *     → Add it (with risks) to `press-test-catalog.ts`.
 *   - **Phantom**: a catalog entry has no source occurrence.
 *     → Remove it from the catalog (or fix the testID typo).
 *   - **Risky uncovered**: a catalog entry has non-empty `risks` but is
 *     not referenced from any unit test or Maestro flow.
 *     → Either add a unit press-test, add a Maestro flow, or (rare) revise
 *       the risk classification.
 *   - **Bad exemption**: a catalog entry sets `exempt` but also declares
 *     risks. Exemption is for navigation/state-only buttons.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import {
  PRESS_TEST_CATALOG,
  type CatalogEntry,
  type Risk,
} from "./press-test-catalog";

const MOBILE_ROOT = join(__dirname, "..");
const SRC_ROOTS = ["app", "components"].map((r) => join(MOBILE_ROOT, r));
const TEST_ROOTS = ["__tests__", "components", "hooks", "lib"].map((r) =>
  join(MOBILE_ROOT, r),
);
const MAESTRO_ROOT = join(MOBILE_ROOT, ".maestro");

const SKIP_DIRS = new Set([
  "node_modules",
  ".expo",
  "ios",
  "android",
  "dist",
  "build",
  "coverage",
  "__tests-config__",
]);

/** Walk a directory tree and call `visit` on every text file. */
function walkFiles(
  root: string,
  visit: (path: string, content: string) => void,
  fileFilter: (name: string) => boolean,
): void {
  let entries: string[];
  try {
    entries = readdirSync(root);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(root, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      walkFiles(full, visit, fileFilter);
      continue;
    }
    if (!fileFilter(entry)) continue;
    let content: string;
    try {
      content = readFileSync(full, "utf8");
    } catch {
      continue;
    }
    visit(full, content);
  }
}

const SOURCE_EXT = /\.(ts|tsx|js|jsx)$/;
const TEST_EXT = /\.test\.(ts|tsx|js|jsx)$/;
const MAESTRO_EXT = /\.(yaml|yml)$/;
/**
 * Match either:
 *   - the static JSX form `testID="btn-foo"`, or
 *   - any string literal `"btn-foo"` / `'btn-foo'` / `` `btn-foo` `` (covers
 *     ternaries like `testID={isRecording ? "btn-record-stop" : "btn-record-start"}`).
 *
 * The literal-match is broad — a comment like `// see btn-foo` would also
 * count as the button being "in source", which is fine: the button still
 * needs a catalog entry.
 */
const TESTID_REGEX = /["'`](btn-[a-z0-9-]+)["'`]/g;

/** All `btn-*` testIDs declared in the source tree. */
function collectSourceTestIDs(): Set<string> {
  const found = new Set<string>();
  for (const root of SRC_ROOTS) {
    walkFiles(
      root,
      (_path, content) => {
        for (const match of content.matchAll(TESTID_REGEX)) {
          found.add(match[1]!);
        }
      },
      (name) => SOURCE_EXT.test(name) && !TEST_EXT.test(name),
    );
  }
  return found;
}

/** All `btn-*` testIDs referenced from any `*.test.*` file under the mobile app. */
function collectUnitCoveredTestIDs(): Set<string> {
  const found = new Set<string>();
  // String literal regex — matches `"btn-..."`, `'btn-...'`, `` `btn-...` ``.
  const REF = /["'`](btn-[a-z0-9-]+)["'`]/g;
  for (const root of TEST_ROOTS) {
    walkFiles(
      root,
      (_path, content) => {
        for (const match of content.matchAll(REF)) {
          found.add(match[1]!);
        }
      },
      (name) => TEST_EXT.test(name),
    );
  }
  return found;
}

/** All `btn-*` testIDs referenced from any Maestro flow. */
function collectMaestroCoveredTestIDs(): Set<string> {
  const found = new Set<string>();
  const REF = /\b(btn-[a-z0-9-]+)\b/g;
  walkFiles(
    MAESTRO_ROOT,
    (_path, content) => {
      for (const match of content.matchAll(REF)) {
        found.add(match[1]!);
      }
    },
    (name) => MAESTRO_EXT.test(name),
  );
  return found;
}

const sourceIDs = collectSourceTestIDs();
const unitCovered = collectUnitCoveredTestIDs();
const maestroCovered = collectMaestroCoveredTestIDs();
const catalogIDs = new Set(PRESS_TEST_CATALOG.map((e) => e.testID));

function isRisky(entry: CatalogEntry): boolean {
  return entry.risks.length > 0;
}
function coverageLayers(testID: string): Risk[] | string[] {
  const layers: string[] = [];
  if (unitCovered.has(testID)) layers.push("unit");
  if (maestroCovered.has(testID)) layers.push("maestro");
  return layers;
}

describe("Press-test coverage gate (catalog ↔ source ↔ tests ↔ Maestro)", () => {
  it("the catalog is internally consistent (no duplicate testIDs)", () => {
    const seen = new Set<string>();
    const dupes: string[] = [];
    for (const e of PRESS_TEST_CATALOG) {
      if (seen.has(e.testID)) dupes.push(e.testID);
      seen.add(e.testID);
    }
    expect(dupes, `Duplicate testIDs in catalog: ${dupes.join(", ")}`).toEqual(
      [],
    );
  });

  it("every catalog entry has a sane shape (risks XOR exempt)", () => {
    const bad: string[] = [];
    for (const e of PRESS_TEST_CATALOG) {
      // Exempt entries must declare zero risks.
      if (e.exempt && e.risks.length > 0) {
        bad.push(
          `${e.testID}: declares risks=[${e.risks.join(",")}] but also exempt="${e.exempt}". Exemption is only for low-risk (nav/state) buttons.`,
        );
      }
      // Non-risky entries SHOULD declare why (exempt) or document the
      // intentional design via `notes`. We allow either to keep the catalog
      // forgiving, but at least one is required so future readers can tell
      // the call wasn't an oversight.
      if (e.risks.length === 0 && !e.exempt && !e.notes) {
        bad.push(
          `${e.testID}: has no risks but also no \`exempt\` reason or \`notes\`. Add one so it's clear the omission is intentional.`,
        );
      }
      // Every sharedHandlerWith reference must be a known catalog testID.
      for (const alias of e.sharedHandlerWith ?? []) {
        if (!catalogIDs.has(alias)) {
          bad.push(
            `${e.testID}: \`sharedHandlerWith\` references "${alias}" which isn't in the catalog.`,
          );
        }
        if (alias === e.testID) {
          bad.push(
            `${e.testID}: \`sharedHandlerWith\` cannot reference itself.`,
          );
        }
      }
    }
    expect(bad, bad.join("\n")).toEqual([]);
  });

  it("every `testID=\"btn-...\"` rendered in source is registered in the catalog", () => {
    const orphans = [...sourceIDs].filter((id) => !catalogIDs.has(id));
    expect(
      orphans,
      orphans.length
        ? `Found ${orphans.length} button(s) in source that aren't in __tests-config__/press-test-catalog.ts:\n` +
            orphans.map((o) => `  - ${o}`).join("\n") +
            `\n\nAdd each one with a \`risks\` classification (or \`exempt\` reason for nav/state buttons).`
        : "",
    ).toEqual([]);
  });

  it("every catalog entry corresponds to a real button in source", () => {
    const phantoms = [...catalogIDs].filter((id) => !sourceIDs.has(id));
    expect(
      phantoms,
      phantoms.length
        ? `Catalog references buttons that no longer exist in source:\n` +
            phantoms.map((p) => `  - ${p}`).join("\n")
        : "",
    ).toEqual([]);
  });

  it("every risky button has at least one coverage layer (unit press test or Maestro flow)", () => {
    const uncovered: string[] = [];
    for (const entry of PRESS_TEST_CATALOG) {
      if (!isRisky(entry)) continue;
      const ids = [entry.testID, ...(entry.sharedHandlerWith ?? [])];
      const layers = ids.flatMap((id) => coverageLayers(id));
      if (layers.length === 0) {
        uncovered.push(
          `  - ${entry.testID} (risks: ${entry.risks.join(",")})` +
            (entry.sharedHandlerWith?.length
              ? ` — none of [${ids.join(", ")}] are covered.`
              : " — neither unit-tested nor Maestro-covered."),
        );
      }
    }
    expect(
      uncovered,
      uncovered.length
        ? `Risky buttons with no coverage:\n${uncovered.join("\n")}\n\n` +
            `Either: (a) add a press-and-invoke unit test that references the testID, ` +
            `(b) add a Maestro flow that taps the button, (c) link via \`sharedHandlerWith\` to an already-covered alias, or (d) revisit the risk classification in the catalog.`
        : "",
    ).toEqual([]);
  });
});
