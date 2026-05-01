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
  return {
    __esModule: true,
    default: {
      View: function AnimatedView(
        props: Record<string, unknown> & { children?: React.ReactNode },
      ) {
        return React.createElement("AnimatedView", props as object, props.children ?? null);
      },
    },
    FadeIn: { duration: () => ({}) },
    FadeOut: { duration: () => ({}) },
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

  it("renders nothing when online and no prior offline", () => {
    setOnline(true);
    let tree: ReturnType<typeof create>;
    act(() => {
      tree = create(<ConnectionBanner />);
    });
    mountedRenderers.push(tree!);
    expect(tree!.toJSON()).toBeNull();
  });

  it("renders offline banner when offline", () => {
    setOnline(false);
    let tree: ReturnType<typeof create>;
    act(() => {
      tree = create(<ConnectionBanner />);
    });
    mountedRenderers.push(tree!);
    expect(tree!.toJSON()).not.toBeNull();
  });

  it("shows back-online banner after reconnect then auto-hides", () => {
    // Start offline.
    setOnline(false);
    let tree: ReturnType<typeof create>;
    act(() => {
      tree = create(<ConnectionBanner />);
    });
    mountedRenderers.push(tree!);
    expect(JSON.stringify(tree!.toJSON())).toContain("Offline");

    // Come back online.
    setOnline(true);
    act(() => {
      tree!.update(<ConnectionBanner />);
    });
    expect(JSON.stringify(tree!.toJSON())).toContain("Reconnected");

    // After timeout, banner disappears.
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    act(() => {
      tree!.update(<ConnectionBanner />);
    });
    expect(tree!.toJSON()).toBeNull();
  });
});
