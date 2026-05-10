/**
 * Vitest setup for mobile-v2.
 *
 * Global stubs for native Expo modules so unit tests can import production
 * code that transitively pulls them in without needing per-test `vi.mock` calls.
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
  manipulateAsync: vi.fn(async (uri: string) => ({
    uri,
    width: 0,
    height: 0,
  })),
  SaveFormat: { JPEG: "jpeg", PNG: "png" },
}));

vi.mock("expo-router", () => ({
  useRouter: vi.fn(() => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
  })),
  useLocalSearchParams: vi.fn(() => ({})),
  Link: vi.fn(({ children }: { children: React.ReactNode }) => children),
  Slot: vi.fn(() => null),
  Stack: {
    Screen: vi.fn(() => null),
  },
  Tabs: vi.fn(({ children }: { children: React.ReactNode }) => children),
  Redirect: vi.fn(() => null),
}));
