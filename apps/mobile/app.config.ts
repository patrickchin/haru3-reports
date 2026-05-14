import { execSync } from "node:child_process";
import type { ExpoConfig } from "expo/config";

const { expo: baseConfig } = require("./app.json") as { expo: ExpoConfig };

/**
 * Resolve the short git SHA at config-evaluation time.
 *
 * Source priority (matches EAS Build & GitHub Actions conventions):
 *   1. EAS_BUILD_GIT_COMMIT_HASH — set by EAS Build inside the build VM
 *   2. GITHUB_SHA               — set by GitHub Actions runners
 *   3. git rev-parse --short HEAD — local dev / OTA `eas update` from a workstation
 *
 * Fails open: if all three fail (e.g., shallow clone with no .git), returns "unknown"
 * so a build never breaks just because the SHA can't be determined.
 */
function resolveGitCommit(): string {
  const fromEnv =
    process.env.EAS_BUILD_GIT_COMMIT_HASH ||
    process.env.GITHUB_SHA ||
    process.env.GIT_COMMIT ||
    "";
  if (fromEnv) return fromEnv.slice(0, 7);

  try {
    return execSync("git rev-parse --short=7 HEAD", {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    return "unknown";
  }
}

const gitCommit = resolveGitCommit();
const displayVersion = `${baseConfig.version ?? "0.0.0"}+${gitCommit}`;

module.exports = (): ExpoConfig => {
  return {
    ...baseConfig,
    extra: {
      ...(baseConfig.extra ?? {}),
      gitCommit,
      displayVersion,
      buildTime: new Date().toISOString(),
    },
  };
};
