import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@/lib/sync/SyncProvider", () => ({
  __esModule: true,
  useSyncDb: vi.fn(),
  LOCAL_FIRST_ENABLED: true,
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

import { create, act } from "react-test-renderer";
import { ConnectionBanner } from "./ConnectionBanner";
import { useSyncDb } from "@/lib/sync/SyncProvider";

const mockUseSyncDb = vi.mocked(useSyncDb);

function setOnline(v: boolean) {
  mockUseSyncDb.mockReturnValue({
    db: null,
    isReady: false,
    isOnline: v,
    clock: () => new Date().toISOString(),
    newId: () => "test-id",
    onPushComplete: () => () => {},
    triggerPush: () => {},
  });
}

describe("ConnectionBanner", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setOnline(true);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders nothing when online and no prior offline", () => {
    setOnline(true);
    let tree: ReturnType<typeof create>;
    act(() => {
      tree = create(<ConnectionBanner />);
    });
    expect(tree!.toJSON()).toBeNull();
  });

  it("renders offline banner when offline", () => {
    setOnline(false);
    let tree: ReturnType<typeof create>;
    act(() => {
      tree = create(<ConnectionBanner />);
    });
    expect(tree!.toJSON()).not.toBeNull();
  });

  it("shows back-online banner after reconnect then auto-hides", () => {
    // Start offline.
    setOnline(false);
    let tree: ReturnType<typeof create>;
    act(() => {
      tree = create(<ConnectionBanner />);
    });
    expect(JSON.stringify(tree!.toJSON())).toContain("Offline");

    // Come back online.
    setOnline(true);
    act(() => {
      tree!.update(<ConnectionBanner />);
    });
    expect(JSON.stringify(tree!.toJSON())).toContain("Back online");

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
