/**
 * Tiny synchronous source grep used by config-level tests. Walks a small
 * set of source roots, skips obvious junk (node_modules, build outputs,
 * the test file calling us), and returns true on the first regex hit.
 *
 * Not a substitute for ripgrep at scale — used only for lint-style checks
 * over a few thousand files at most.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const SKIP_DIRS = new Set([
  "node_modules",
  ".expo",
  "ios",
  "android",
  "dist",
  "build",
  "coverage",
  ".maestro",
  "__tests-config__",
]);
const TEXT_EXT = /\.(ts|tsx|js|jsx|mjs|cjs)$/;

export function search(pattern: RegExp, roots: string[]): boolean {
  for (const root of roots) {
    if (walk(root, pattern)) return true;
  }
  return false;
}

function walk(dir: string, pattern: RegExp): boolean {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return false;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      if (walk(full, pattern)) return true;
      continue;
    }
    if (!TEXT_EXT.test(entry)) continue;
    let content: string;
    try {
      content = readFileSync(full, "utf8");
    } catch {
      continue;
    }
    if (pattern.test(content)) return true;
  }
  return false;
}
