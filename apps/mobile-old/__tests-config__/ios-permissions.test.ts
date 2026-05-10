/**
 * Static check: every iOS privacy-protected API the app uses must have
 * its corresponding `NS*UsageDescription` key declared in BOTH
 *   - `ios/HarpaPro/Info.plist` (what gets shipped in the binary), and
 *   - `app.json > ios.infoPlist` (what survives `expo prebuild`).
 *
 * iOS aborts the process with SIGABRT the moment a privacy-protected API
 * is invoked without a usage description — there is no JS-level error
 * to catch. The crash is silent in unit tests because Vitest never runs
 * the native code; the only signal is a runtime crash on device.
 *
 * Sister to `__tests-config__/android-permissions.test.ts` — see that
 * file for the same pattern applied to AndroidManifest.xml permissions.
 *
 * If you add a new native capability (camera, location, contacts, …),
 * either:
 *   1. add the capability's API trigger pattern to API_TRIGGERS below
 *      AND its required usage description to both Info.plist and
 *      app.json > ios.infoPlist, or
 *   2. ensure the corresponding Expo plugin in app.json sets the key
 *      and rerun `expo prebuild` so it lands in Info.plist.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import appJson from "../app.json";
import { search as ripgrep } from "./helpers/ripgrep";

interface Trigger {
  /** Human-readable capability name. */
  capability: string;
  /** Regex matching API calls that need the usage description at runtime. */
  apiPattern: RegExp;
  /** `NS*UsageDescription` key that MUST be present when the API is used. */
  requiredKey: string;
}

const API_TRIGGERS: Trigger[] = [
  {
    capability: "Camera capture (expo-image-picker)",
    apiPattern:
      /ImagePicker\.launchCameraAsync\b|ImagePicker\.requestCameraPermissionsAsync\b/,
    requiredKey: "NSCameraUsageDescription",
  },
  {
    capability: "Photo library picker (expo-image-picker)",
    apiPattern:
      /ImagePicker\.launchImageLibraryAsync\b|ImagePicker\.requestMediaLibraryPermissionsAsync\b/,
    requiredKey: "NSPhotoLibraryUsageDescription",
  },
  {
    capability: "Microphone / audio recording (expo-audio)",
    apiPattern: /\bAudio(Recorder|Module)\b|\buseAudioRecorder\b|expo-audio/,
    requiredKey: "NSMicrophoneUsageDescription",
  },
];

const SEARCH_ROOTS = ["app", "components", "hooks", "lib"];
const INFO_PLIST_PATH = join(__dirname, "..", "ios", "HarpaPro", "Info.plist");

describe("iOS Info.plist usage descriptions", () => {
  const plistSource = readFileSync(INFO_PLIST_PATH, "utf8");
  const declaredInPlist = parsePlistKeys(plistSource);
  const declaredInAppJson = new Set(
    Object.keys(appJson.expo.ios?.infoPlist ?? {}),
  );

  for (const trigger of API_TRIGGERS) {
    it(`declares ${trigger.requiredKey} when ${trigger.capability} is used`, () => {
      const used = isApiUsedInSource(trigger.apiPattern);
      if (!used) return;

      // The committed Info.plist is what actually ships in the binary.
      // Missing this key crashes the app at runtime (SIGABRT) the moment
      // the API is invoked.
      expect(
        declaredInPlist.has(trigger.requiredKey),
        `${trigger.capability} is invoked in app code but ios/HarpaPro/Info.plist is missing <key>${trigger.requiredKey}</key>. ` +
          `iOS aborts the process with SIGABRT when a privacy-protected API runs without its usage description.`,
      ).toBe(true);

      // app.json's ios.infoPlist is the source of truth across rebuilds:
      // a future `expo prebuild` would otherwise overwrite Info.plist
      // and reintroduce the crash.
      expect(
        declaredInAppJson.has(trigger.requiredKey),
        `${trigger.capability} is invoked but app.json > expo.ios.infoPlist is missing "${trigger.requiredKey}". ` +
          `Without it, the next \`expo prebuild\` regenerates Info.plist without the description and the crash returns.`,
      ).toBe(true);
    });
  }
});

function isApiUsedInSource(pattern: RegExp): boolean {
  const mobileRoot = join(__dirname, "..");
  return ripgrep(
    pattern,
    SEARCH_ROOTS.map((r) => join(mobileRoot, r)),
  );
}

/**
 * Extract the set of `<key>…</key>` names declared in an Info.plist.
 * Good enough for a static config check — the plist is hand-edited and
 * always well-formed.
 */
function parsePlistKeys(source: string): Set<string> {
  const keys = new Set<string>();
  const re = /<key>([^<]+)<\/key>/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source)) !== null) {
    keys.add(match[1]!);
  }
  return keys;
}
