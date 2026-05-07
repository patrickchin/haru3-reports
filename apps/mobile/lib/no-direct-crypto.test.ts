import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Regression guard: nothing in the mobile app may reach for
 * `globalThis.crypto` / `global.crypto` / bare `crypto.X` directly.
 *
 * Hermes release builds on iOS do NOT expose `globalThis.crypto`, and we
 * have not added a polyfill (no `expo-crypto`, no
 * `react-native-get-random-values`). Calling it directly crashes the app
 * with "TypeError: Cannot read property 'randomUUID' of undefined".
 *
 * All UUID generation MUST go through `safeRandomUUID()` in
 * `apps/mobile/lib/uuid.ts`, which guards against missing `crypto`.
 */

const MOBILE_ROOT = join(__dirname, "..");

const SCAN_DIRS = ["app", "components", "hooks", "lib", "providers"] as const;

// These are intentionally allowed to mention `crypto` — the safe wrapper
// itself, comments/docs about it, and tests verifying it.
const ALLOWLIST = new Set<string>([
  "lib/uuid.ts",
  "lib/uuid.test.ts",
  "lib/no-direct-crypto.test.ts",
  // file-upload.test.ts only references crypto in test strings/mocks.
  "lib/file-upload.test.ts",
]);

const FORBIDDEN_PATTERNS: ReadonlyArray<RegExp> = [
  /\bglobalThis\.crypto\b/,
  /\bglobal\.crypto\b/,
  // Bare `crypto.randomUUID(` / `crypto.getRandomValues(` etc. — i.e. any
  // direct call on a `crypto` identifier we did not import explicitly.
  /(?<![A-Za-z0-9_$.])crypto\.(randomUUID|getRandomValues|subtle)\b/,
];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === "node_modules" || entry === ".expo" || entry === "dist") continue;
      walk(full, out);
    } else if (/\.(ts|tsx|js|jsx)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

describe("no direct globalThis.crypto usage", () => {
  it("forces all callers through safeRandomUUID", () => {
    const offenders: string[] = [];

    for (const sub of SCAN_DIRS) {
      const dir = join(MOBILE_ROOT, sub);
      let files: string[] = [];
      try {
        files = walk(dir);
      } catch {
        // Directory may not exist in this checkout — that is fine.
        continue;
      }

      for (const file of files) {
        const rel = relative(MOBILE_ROOT, file).replace(/\\/g, "/");
        if (ALLOWLIST.has(rel)) continue;

        const src = readFileSync(file, "utf8");
        for (const pattern of FORBIDDEN_PATTERNS) {
          const match = src.match(pattern);
          if (match) {
            offenders.push(`${rel}: matches ${pattern} -> "${match[0]}"`);
          }
        }
      }
    }

    expect(
      offenders,
      "Direct crypto access detected — use safeRandomUUID() from lib/uuid.ts instead.\n" +
        offenders.join("\n"),
    ).toEqual([]);
  });
});
