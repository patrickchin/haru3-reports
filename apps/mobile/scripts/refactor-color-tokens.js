#!/usr/bin/env node
/**
 * One-shot refactor: replace hardcoded color literals in apps/mobile
 * with imports from `@/lib/design-tokens/colors`.
 *
 * Conservative: only rewrites the safe, deterministic patterns:
 *   color="#1a1a2e"       -> color={colors.foreground}
 *   color="#5c5c6e"       -> color={colors.muted.foreground}
 *   color="#f8f6f1"       -> color={colors.background}
 *   color="#f8f5ee"       -> color={colors.primary.foreground}
 *   color="#fffaf2"       -> color={colors.primary.foreground}
 *   color="#ffffff"       -> color={colors.primary.foreground}  (when on primary surface — heuristic)
 *   color="#8f1d18"       -> color={colors.danger.text}
 *   color="#16a34a"       -> color={colors.success.DEFAULT}
 *   color="#64748b"       -> color={colors.muted.foreground}
 *   color="#dc2626"       -> color={colors.danger.DEFAULT}
 *   placeholderTextColor="#5c5c6e" -> placeholderTextColor={colors.muted.foreground}
 *   backgroundColor: "#f8f6f1"     -> backgroundColor: colors.background
 *   color: "#1a1a2e"               -> color: colors.foreground
 *   color: "#5c5c6e"               -> color: colors.muted.foreground
 *   borderColor: "#1a1a2e"         -> borderColor: colors.foreground
 *   tabBarActiveTintColor: "#1a1a2e"   -> ... colors.foreground
 *   tabBarInactiveTintColor: "#5c5c6e" -> ... colors.muted.foreground
 *
 * Always inserts `import { colors } from "@/lib/design-tokens/colors";`
 * after the last existing import in any file we modify.
 */
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const SCAN_DIRS = [path.join(ROOT, "app"), path.join(ROOT, "components")];

// Order matters: more specific patterns first.
const REPLACEMENTS = [
  [/(\bcolor=)"#1a1a2e"/g, "$1{colors.foreground}"],
  [/(\bcolor=)"#5c5c6e"/g, "$1{colors.muted.foreground}"],
  [/(\bcolor=)"#f8f6f1"/g, "$1{colors.primary.foreground}"], // historical: cream-on-orange icon
  [/(\bcolor=)"#f8f5ee"/g, "$1{colors.primary.foreground}"],
  [/(\bcolor=)"#fffaf2"/g, "$1{colors.primary.foreground}"],
  [/(\bcolor=)"#ffffff"/g, "$1{colors.primary.foreground}"],
  [/(\bcolor=)"#8f1d18"/g, "$1{colors.danger.text}"],
  [/(\bcolor=)"#16a34a"/g, "$1{colors.success.DEFAULT}"],
  [/(\bcolor=)"#64748b"/g, "$1{colors.muted.foreground}"],
  [/(\bcolor=)"#dc2626"/g, "$1{colors.danger.DEFAULT}"],
  [/(\bcolor=)"#b3261e"/g, "$1{colors.danger.DEFAULT}"],
  [/(\bcolor=)"#b66916"/g, "$1{colors.warning.text}"],
  [/(\bcolor=)"#92400e"/g, "$1{colors.warning.text}"],
  [/(\bcolor=)"#166534"/g, "$1{colors.success.text}"],
  [/(\bcolor=)"#8e510e"/g, "$1{colors.warning.text}"],

  [/placeholderTextColor="#5c5c6e"/g, "placeholderTextColor={colors.muted.foreground}"],
  [/placeholderTextColor="#1a1a2e"/g, "placeholderTextColor={colors.foreground}"],

  // Object-literal style props (StyleSheet.create / inline style objects).
  [/(\bbackgroundColor:\s*)"#f8f6f1"/g, "$1colors.background"],
  [/(\bbackgroundColor:\s*)"#1a1a2e"/g, "$1colors.foreground"],
  [/(\bbackgroundColor:\s*)"#ffffff"/g, "$1colors.card"],
  [/(\bcolor:\s*)"#1a1a2e"/g, "$1colors.foreground"],
  [/(\bcolor:\s*)"#5c5c6e"/g, "$1colors.muted.foreground"],
  [/(\bborderColor:\s*)"#1a1a2e"/g, "$1colors.foreground"],
  [/(\bshadowColor:\s*)"#1a1a2e"/g, "$1colors.surface.shadow"],

  // Expo Router screenOptions.
  [/(tabBarActiveTintColor:\s*)"#1a1a2e"/g, "$1colors.foreground"],
  [/(tabBarInactiveTintColor:\s*)"#5c5c6e"/g, "$1colors.muted.foreground"],
];

const IMPORT_LINE = 'import { colors } from "@/lib/design-tokens/colors";';

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      walk(full, files);
    } else if (/\.(tsx?|jsx?)$/.test(entry.name) && !/\.test\.[tj]sx?$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

function ensureImport(source) {
  if (source.includes("@/lib/design-tokens/colors")) return source;
  // Insert after the last `import ... from ...;` line.
  const lines = source.split("\n");
  let lastImport = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^import\s.+from\s.+;\s*$/.test(lines[i])) lastImport = i;
    else if (lastImport >= 0 && lines[i].trim() === "") continue;
    else if (lastImport >= 0 && !/^\s*\/\//.test(lines[i])) break;
  }
  if (lastImport < 0) return IMPORT_LINE + "\n" + source;
  lines.splice(lastImport + 1, 0, IMPORT_LINE);
  return lines.join("\n");
}

let changedFiles = 0;
let totalReplacements = 0;
const skipFiles = new Set([
  path.resolve(ROOT, "lib/design-tokens/colors.ts"),
  path.resolve(ROOT, "lib/design-tokens/index.ts"),
  path.resolve(ROOT, "lib/report-to-html.ts"),
]);

for (const dir of SCAN_DIRS) {
  if (!fs.existsSync(dir)) continue;
  for (const file of walk(dir)) {
    const abs = path.resolve(file);
    if (skipFiles.has(abs)) continue;
    const original = fs.readFileSync(file, "utf8");
    let updated = original;
    let count = 0;
    for (const [pattern, replacement] of REPLACEMENTS) {
      updated = updated.replace(pattern, (...args) => {
        count++;
        // The last 2 args are offset and full string — drop them.
        const groups = args.slice(0, -2);
        return typeof replacement === "string"
          ? replacement.replace(/\$(\d+)/g, (_, n) => groups[Number(n)] ?? "")
          : replacement(...args);
      });
    }
    if (count > 0 && updated !== original) {
      updated = ensureImport(updated);
      fs.writeFileSync(file, updated);
      changedFiles++;
      totalReplacements += count;
      console.log(`  ${path.relative(ROOT, file)}: ${count}`);
    }
  }
}

console.log(`\nDone: ${changedFiles} files, ${totalReplacements} replacements.`);
