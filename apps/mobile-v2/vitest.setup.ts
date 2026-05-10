/**
 * Vitest setup for mobile-v2.
 *
 * Global stubs for native Expo modules so unit tests can import production
 * code that transitively pulls them in without needing per-test `vi.mock` calls.
 */
import { vi } from "vitest";

// AsyncStorage mock (required for Supabase client auth.storage)
vi.mock("@react-native-async-storage/async-storage", () => {
  const store = new Map<string, string>();
  return {
    default: {
      getItem: vi.fn(async (key: string) => store.get(key) ?? null),
      setItem: vi.fn(async (key: string, value: string) => {
        store.set(key, value);
      }),
      removeItem: vi.fn(async (key: string) => {
        store.delete(key);
      }),
      clear: vi.fn(async () => {
        store.clear();
      }),
      getAllKeys: vi.fn(async () => Array.from(store.keys())),
      multiGet: vi.fn(async (keys: string[]) =>
        keys.map((k) => [k, store.get(k) ?? null])
      ),
      multiSet: vi.fn(async (pairs: [string, string][]) => {
        pairs.forEach(([k, v]) => store.set(k, v));
      }),
      multiRemove: vi.fn(async (keys: string[]) => {
        keys.forEach((k) => store.delete(k));
      }),
    },
  };
});

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

vi.mock("expo-av", () => ({
  Audio: {
    AndroidOutputFormat: { MPEG_4: 0 },
    AndroidAudioEncoder: { AAC: 0 },
    IOSOutputFormat: { MPEG4AAC: 0 },
    IOSAudioQuality: { HIGH: 0 },
    INTERRUPTION_MODE_IOS_DO_NOT_MIX: 1,
    INTERRUPTION_MODE_ANDROID_DO_NOT_MIX: 1,
    requestPermissionsAsync: vi.fn(async () => ({ status: "granted", granted: true })),
    setAudioModeAsync: vi.fn(async () => undefined),
    Recording: vi.fn().mockImplementation(() => ({
      prepareToRecordAsync: vi.fn(async () => undefined),
      startAsync: vi.fn(async () => undefined),
      pauseAsync: vi.fn(async () => undefined),
      stopAndUnloadAsync: vi.fn(async () => undefined),
      getURI: vi.fn(() => "file://mock-recording.m4a"),
      getStatusAsync: vi.fn(async () => ({
        durationMillis: 0,
        isRecording: false,
        metering: -160,
      })),
      resumeAsync: vi.fn(async () => undefined),
    })),
  },
}));

vi.mock("expo-audio", () => ({
  useAudioRecorder: vi.fn(() => ({
    record: vi.fn(async () => undefined),
    stop: vi.fn(async () => undefined),
    getUri: vi.fn(() => null),
  })),
  useAudioPlayer: vi.fn(() => ({
    play: vi.fn(async () => undefined),
    pause: vi.fn(async () => undefined),
    duration: 0,
    currentTime: 0,
    playing: false,
  })),
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

vi.mock("lucide-react-native", () => {
  const Icon = () => null;
  return new Proxy(
    {},
    {
      get: () => Icon,
    }
  );
});

vi.mock("@notifee/react-native", () => ({
  default: {
    createChannel: vi.fn(async () => "channel-id"),
    displayNotification: vi.fn(async () => "notif-id"),
    cancelNotification: vi.fn(async () => undefined),
    cancelAllNotifications: vi.fn(async () => undefined),
    getDisplayedNotifications: vi.fn(async () => []),
  },
  AndroidImportance: {
    DEFAULT: 3,
    HIGH: 4,
  },
}));

vi.mock("react-native-gesture-handler", () => ({
  GestureHandlerRootView: ({ children }: any) => children,
  Swipeable: ({ children }: any) => children,
}));

vi.mock("react-native-reanimated", () => {
  const RN = require("react-native");
  const Animated = {
    View: RN.View,
    Text: RN.Text,
    ScrollView: RN.ScrollView,
    FlatList: RN.FlatList,
    createAnimatedComponent: (component: any) => component,
  };
  return {
    default: Animated,
    FadeIn: { duration: vi.fn(() => ({})) },
    FadeOut: { duration: vi.fn(() => ({})) },
    SlideInDown: { duration: vi.fn(() => ({})) },
    SlideInUp: { duration: vi.fn(() => ({})) },
    SlideOutDown: { duration: vi.fn(() => ({})) },
    SlideOutUp: { duration: vi.fn(() => ({})) },
    useSharedValue: vi.fn(() => ({ value: 0 })),
    useAnimatedStyle: vi.fn(() => ({})),
    withTiming: vi.fn((value) => value),
    withSpring: vi.fn((value) => value),
    runOnJS: vi.fn((fn) => fn),
  };
});
