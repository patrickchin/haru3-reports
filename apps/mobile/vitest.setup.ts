/**
 * Vitest setup — global stubs for native Expo modules so unit tests can
 * import production code that transitively pulls them in (e.g. `expo-image`
 * via `CachedImage`, `expo-file-system/legacy` via the project-file picker)
 * without needing per-test `vi.mock` calls.
 *
 * Each stub is intentionally minimal: just enough surface for the imports
 * to resolve. Tests that exercise these modules' behaviour should override
 * with their own `vi.mock` block.
 */
import { vi } from "vitest";

vi.mock("expo-modules-core", () => ({
  EventEmitter: class {
    addListener() {
      return { remove() {} };
    }
    removeAllListeners() {}
    emit() {}
  },
  NativeModule: class {},
  requireNativeModule: () => ({}),
  requireOptionalNativeModule: () => null,
  Platform: {
    OS: "ios",
    select: <T>(spec: { ios?: T; default?: T }) => spec.ios ?? spec.default,
  },
}));

vi.mock("expo-image", () => ({
  Image: () => null,
}));

vi.mock("expo-file-system/legacy", () => ({
  readAsStringAsync: vi.fn(async () => ""),
  writeAsStringAsync: vi.fn(async () => undefined),
  getInfoAsync: vi.fn(async () => ({ exists: false })),
  deleteAsync: vi.fn(async () => undefined),
  EncodingType: { Base64: "base64", UTF8: "utf8" },
}));

vi.mock("expo-image-manipulator", () => ({
  manipulateAsync: vi.fn(async (uri: string) => ({ uri, width: 0, height: 0 })),
  SaveFormat: { JPEG: "jpeg", PNG: "png" },
}));
