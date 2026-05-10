import { execSync } from "node:child_process";
import type { ExpoConfig } from "expo/config";

const { expo: baseConfig } = require("./app.json") as { expo: ExpoConfig };

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
