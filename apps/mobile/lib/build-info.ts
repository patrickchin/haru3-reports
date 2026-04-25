import Constants from "expo-constants";

type BuildExtra = {
  gitCommit?: string;
  displayVersion?: string;
  buildTime?: string;
};

const extra = (Constants.expoConfig?.extra ?? {}) as BuildExtra;

/**
 * Build/version info exposed at runtime.
 *
 * `version`         : the marketing version from app.json (e.g. "1.0.0")
 * `gitCommit`       : 7-char git SHA captured at config-evaluation time
 *                     (EAS Build / GitHub Actions / local shell-out)
 * `displayVersion`  : "<version>+<gitCommit>" — safe to show in UI
 * `buildTime`       : ISO timestamp captured at config-evaluation time
 */
export const buildInfo = {
  version: Constants.expoConfig?.version ?? "0.0.0",
  gitCommit: extra.gitCommit ?? "unknown",
  displayVersion:
    extra.displayVersion ??
    `${Constants.expoConfig?.version ?? "0.0.0"}+${extra.gitCommit ?? "unknown"}`,
  buildTime: extra.buildTime,
} as const;
