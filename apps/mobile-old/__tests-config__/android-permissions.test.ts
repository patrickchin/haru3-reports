/**
 * Static check: every native API the app uses must have its corresponding
 * Android permission declared in `app.json > android.permissions`.
 *
 * This catches the Expo footgun where `android.permissions`, when present,
 * acts as an allowlist — permissions that plugins (e.g. expo-image-picker,
 * expo-audio) would normally auto-merge into AndroidManifest.xml are
 * silently stripped if they're not listed. The result is a runtime crash
 * on Android the moment the missing-permission API is invoked, with no
 * compile-time or unit-test signal.
 *
 * If you add a new native capability (camera, location, contacts, …),
 * either:
 *   1. add the capability's API trigger pattern to API_TRIGGERS below
 *      AND its required permission to app.json, or
 *   2. remove `android.permissions` from app.json entirely so Expo's
 *      auto-merge takes over (loses the explicit allowlist, but matches
 *      what most Expo apps do).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import appJson from "../app.json";
import { search as ripgrep } from "./helpers/ripgrep";

interface Trigger {
  /** Human-readable capability name. */
  capability: string;
  /** Regex matching API calls that need this capability at runtime. */
  apiPattern: RegExp;
  /** Android permissions that MUST be present in app.json when the API is used. */
  requiredAndroidPermissions: string[];
}

const API_TRIGGERS: Trigger[] = [
  {
    capability: "Camera capture (expo-image-picker)",
    apiPattern: /ImagePicker\.launchCameraAsync\b/,
    requiredAndroidPermissions: ["android.permission.CAMERA"],
  },
  {
    capability: "Photo library picker (expo-image-picker, Android 13+)",
    apiPattern: /ImagePicker\.launchImageLibraryAsync\b/,
    requiredAndroidPermissions: ["android.permission.READ_MEDIA_IMAGES"],
  },
  {
    capability: "Microphone / audio recording (expo-audio)",
    apiPattern:
      /\bAudio(Recorder|Module)\b|\buseAudioRecorder\b|expo-audio/,
    requiredAndroidPermissions: ["android.permission.RECORD_AUDIO"],
  },
];

const SEARCH_ROOTS = ["app", "components", "hooks", "lib"];

describe("Android permission allowlist (app.json)", () => {
  const declared = new Set<string>(appJson.expo.android.permissions ?? []);

  for (const trigger of API_TRIGGERS) {
    it(`declares permissions for ${trigger.capability} when the API is used`, () => {
      const used = isApiUsedInSource(trigger.apiPattern);
      if (!used) return;
      const missing = trigger.requiredAndroidPermissions.filter(
        (p) => !declared.has(p),
      );
      expect(
        missing,
        `${trigger.capability} is invoked in app code but app.json > android.permissions is missing: ${missing.join(", ")}. ` +
          `Expo's android.permissions array acts as an allowlist; missing entries get stripped from AndroidManifest.xml and crash at runtime.`,
      ).toEqual([]);
    });
  }
});

function isApiUsedInSource(pattern: RegExp): boolean {
  // Resolve from this test file's directory: __tests-config__/<file>.test.ts
  const mobileRoot = join(__dirname, "..");
  return ripgrep(pattern, SEARCH_ROOTS.map((r) => join(mobileRoot, r)));
}
