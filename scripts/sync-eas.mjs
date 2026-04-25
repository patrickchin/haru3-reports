#!/usr/bin/env node
// Sync EAS environment variables from Doppler. Cross-platform (Node.js).
//
// Vercel and Supabase have native Doppler integrations (auto-sync via the
// Doppler dashboard). EAS does not, so this script handles only EAS.
//
// Usage: node scripts/sync-eas.mjs <development|preview|production>
// CI:    set DOPPLER_TOKEN to a service token scoped to the chosen config.
//
// Doppler config <-> EAS environment mapping is 1:1 by name. Only
// EXPO_PUBLIC_* variables are pushed (the rest stay in Doppler).

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const VALID = new Set(["development", "preview", "production"]);
const env = process.argv[2];
if (!VALID.has(env)) {
  console.error("Usage: sync-eas <development|preview|production>");
  process.exit(64);
}

const run = (cmd, args, opts = {}) => {
  const res = spawnSync(cmd, args, { stdio: ["ignore", "pipe", "inherit"], ...opts });
  if (res.status !== 0) process.exit(res.status ?? 1);
  return res.stdout?.toString() ?? "";
};

// 1. Download Doppler secrets, filter to EXPO_PUBLIC_*
const dotenv = run("doppler", [
  "secrets", "download",
  "--project", "harpa-pro",
  "--config", env,
  "--no-file", "--format", "env",
]);
const filtered = dotenv
  .split("\n")
  .filter((line) => /^EXPO_PUBLIC_/.test(line))
  .join("\n");

// 2. Write to a temp file (works on Windows; eas env:push needs --path)
const dir = mkdtempSync(join(tmpdir(), "sync-eas-"));
const tmpPath = join(dir, ".env");
writeFileSync(tmpPath, filtered, { mode: 0o600 });

try {
  // 3. Push to EAS. shell:true so `eas` resolves on Windows (eas.cmd).
  run("eas", ["env:push", "--environment", env, "--path", tmpPath, "--force"], {
    cwd: "apps/mobile",
    stdio: "inherit",
    shell: process.platform === "win32",
  });
} finally {
  rmSync(dir, { recursive: true, force: true });
}
