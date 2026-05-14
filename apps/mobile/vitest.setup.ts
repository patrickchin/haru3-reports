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

vi.mock("expo-image", () => {
  // Static methods on the Image namespace (used by preprocess-image.ts and
  // by clearImageCachesOnSignOut). Tests that need to assert on them can
  // override this mock with `vi.mock("expo-image", ...)` in the test file.
  const Image = Object.assign(() => null, {
    generateBlurhashAsync: vi.fn(async () => null),
    generateThumbhashAsync: vi.fn(async () => ""),
    clearMemoryCache: vi.fn(async () => true),
    clearDiskCache: vi.fn(async () => true),
    prefetch: vi.fn(async () => true),
    getCachePathAsync: vi.fn(async () => null),
  });
  return { Image };
});

vi.mock("expo-file-system/legacy", () => ({
  readAsStringAsync: vi.fn(async () => ""),
  writeAsStringAsync: vi.fn(async () => undefined),
  getInfoAsync: vi.fn(async () => ({ exists: false })),
  deleteAsync: vi.fn(async () => undefined),
  makeDirectoryAsync: vi.fn(async () => undefined),
  copyAsync: vi.fn(async () => undefined),
  cacheDirectory: "file:///cache/",
  documentDirectory: "file:///docs/",
  EncodingType: { Base64: "base64", UTF8: "utf8" },
}));

// Next-API entry. The real module's `File` class extends a native
// `ExpoFileSystem.FileSystemFile` symbol that Vitest can't resolve
// (it's wired through `requireNativeModule`). Tests that need
// `File(uri).bytes()` etc. should override this with their own
// `vi.mock` block; this default just lets transitive imports succeed.
vi.mock("expo-file-system", () => {
  class FakeFile {
    uri: string;
    constructor(uri: string) {
      this.uri = uri;
    }
    async bytes(): Promise<Uint8Array> {
      return new Uint8Array();
    }
    async arrayBuffer(): Promise<ArrayBuffer> {
      return new ArrayBuffer(0);
    }
    delete() {}
  }
  class FakeDirectory {
    uri: string;
    constructor(uri: string) {
      this.uri = uri;
    }
  }
  return {
    File: FakeFile,
    Directory: FakeDirectory,
    Paths: {
      cache: { uri: "file:///cache/" },
      document: { uri: "file:///docs/" },
    },
  };
});

vi.mock("expo-crypto", () => ({
  randomUUID: vi.fn(() => "00000000-0000-4000-8000-000000000000"),
}));

vi.mock("expo-image-manipulator", () => ({
  manipulateAsync: vi.fn(async (uri: string) => ({ uri, width: 0, height: 0 })),
  SaveFormat: { JPEG: "jpeg", PNG: "png" },
}));
