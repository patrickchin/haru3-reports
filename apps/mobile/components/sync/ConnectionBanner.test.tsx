import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@/lib/sync/SyncProvider", () => ({
  __esModule: true,
  useSyncDb: vi.fn(),
}));

vi.mock("react-native", () => {
  const React = require("react");
  const mk = (name: string) =>
    function Stub(props: Record<string, unknown> & { children?: React.ReactNode }) {
      return React.createElement(name, props as object, props.children ?? null);
    };
  return { View: mk("View"), Text: mk("Text") };
});

vi.mock("react-native-reanimated", () => {
  const React = require("react");
  const layout = { duration: () => ({}) };
  return {
    __esModule: true,
    default: {
      View: function AnimatedView(
        props: Record<string, unknown> & { children?: React.ReactNode },
      ) {
        return React.createElement("AnimatedView", props as object, props.children ?? null);
      },
    },
    FadeIn: layout,
    FadeOut: layout,
    SlideInUp: layout,
    SlideOutUp: layout,
    Easing: { out: (fn: unknown) => fn, cubic: () => 0 },
    useSharedValue: (v: number) => ({ value: v }),
    useAnimatedStyle: () => ({}),
    withTiming: (v: number) => v,
    interpolateColor: (_v: number, _input: number[], output: string[]) => output[0],
  };
});

vi.mock("lucide-react-native", () => ({
  WifiOff: () => null,
  Wifi: () => null,
}));

vi.mock("react-native-safe-area-context", () => {
  const React = require("react");
  return {
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
    SafeAreaInsetsContext: React.createContext({
      top: 0,
      bottom: 0,
      left: 0,
      right: 0,
    }),
  };
});

import { create, act } from "react-test-renderer";
import { ConnectionBanner } from "./ConnectionBanner";
import { useSyncDb } from "@/lib/sync/SyncProvider";

const mockUseSyncDb = vi.mocked(useSyncDb);
const mountedRenderers: ReturnType<typeof create>[] = [];

function setOnline(v: boolean) {
  mockUseSyncDb.mockReturnValue({
    db: null,
    isReady: false,
    isOnline: v,
    clock: () => new Date().toISOString(),
    newId: () => "test-id",
    onPushComplete: () => () => {},
    onPullComplete: () => () => {},
    triggerPush: () => {},
    triggerPull: async () => {},
    triggerGeneration: () => {},
  });
}

describe("ConnectionBanner", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setOnline(true);
  });

  afterEach(() => {
    act(() => {
      for (const renderer of mountedRenderers) {
        renderer.unmount();
      }
      mountedRenderers.length = 0;
    });
    vi.useRealTimers();
  });

  it("shows offline copy when offline", () => {
    setOnline(false);
    let tree: ReturnType<typeof create>;
    act(() => {
      tree = create(<ConnectionBanner />);
    });
    mountedRenderers.push(tree!);
    expect(JSON.stringify(tree!.toJSON())).toContain("Offline");
  });

  it("swaps offline copy for reconnected copy after coming back online", () => {
    // Start offline.
    setOnline(false);
    let tree: ReturnType<typeof create>;
    act(() => {
      tree = create(<ConnectionBanner />);
    });
    mountedRenderers.push(tree!);
    expect(JSON.stringify(tree!.toJSON())).toContain("Offline");

    // Come back online: cross-fades to the reconnected copy.
    setOnline(true);
    act(() => {
      tree!.update(<ConnectionBanner />);
    });
    expect(JSON.stringify(tree!.toJSON())).toContain("Reconnected");
  });
});
