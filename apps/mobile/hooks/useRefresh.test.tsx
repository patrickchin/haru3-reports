import React from "react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import TestRenderer, { act } from "react-test-renderer";

const triggerPullMock = vi.fn();
vi.mock("@/lib/sync/SyncProvider", () => ({
  useSyncDb: () => ({
    db: null,
    isReady: false,
    isOnline: true,
    clock: () => "2026-04-29T00:00:00.000Z",
    newId: () => "id",
    onPushComplete: () => () => {},
    onPullComplete: () => () => {},
    triggerPush: () => {},
    triggerPull: triggerPullMock,
    triggerGeneration: () => {},
  }),
}));

import { useRefresh, type Refetcher } from "./useRefresh";

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
});
afterEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
});

type Captured = {
  refreshing: boolean;
  onRefresh: () => void;
};

function Probe({
  refetchers,
  capture,
}: {
  refetchers: readonly Refetcher[];
  capture: (state: Captured) => void;
}) {
  const state = useRefresh(refetchers);
  capture(state);
  return null;
}

function flush() {
  return Promise.resolve().then(() => Promise.resolve());
}

describe("useRefresh", () => {
  it("calls triggerPull and all refetchers; toggles refreshing", async () => {
    let resolveA: (v: unknown) => void = () => {};
    let resolveB: (v: unknown) => void = () => {};
    const refA = vi.fn(
      () => new Promise((res) => { resolveA = res; }),
    );
    const refB = vi.fn(
      () => new Promise((res) => { resolveB = res; }),
    );

    const captured: Captured[] = [];
    let tree: TestRenderer.ReactTestRenderer | null = null;
    act(() => {
      tree = TestRenderer.create(
        <Probe
          refetchers={[refA, refB]}
          capture={(s) => captured.push(s)}
        />,
      );
    });
    const renderer = tree as unknown as TestRenderer.ReactTestRenderer;

    const initial = captured[captured.length - 1];
    expect(initial.refreshing).toBe(false);

    act(() => {
      initial.onRefresh();
    });

    expect(triggerPullMock).toHaveBeenCalledTimes(1);
    expect(refA).toHaveBeenCalledTimes(1);
    expect(refB).toHaveBeenCalledTimes(1);
    expect(captured[captured.length - 1].refreshing).toBe(true);

    resolveA(null);
    resolveB(null);
    await act(async () => {
      await flush();
    });

    expect(captured[captured.length - 1].refreshing).toBe(false);
    renderer.unmount();
  });

  it("swallows refetcher errors and still releases refreshing", async () => {
    const refA = vi.fn(() => Promise.reject(new Error("boom")));

    const captured: Captured[] = [];
    let tree: TestRenderer.ReactTestRenderer | null = null;
    act(() => {
      tree = TestRenderer.create(
        <Probe
          refetchers={[refA]}
          capture={(s) => captured.push(s)}
        />,
      );
    });
    const renderer = tree as unknown as TestRenderer.ReactTestRenderer;

    act(() => {
      captured[captured.length - 1].onRefresh();
    });
    expect(captured[captured.length - 1].refreshing).toBe(true);

    await act(async () => {
      await flush();
    });

    expect(captured[captured.length - 1].refreshing).toBe(false);
    renderer.unmount();
  });

  it("works with no refetchers (still calls triggerPull)", async () => {
    const captured: Captured[] = [];
    let tree: TestRenderer.ReactTestRenderer | null = null;
    act(() => {
      tree = TestRenderer.create(
        <Probe refetchers={[]} capture={(s) => captured.push(s)} />,
      );
    });
    const renderer = tree as unknown as TestRenderer.ReactTestRenderer;

    act(() => {
      captured[captured.length - 1].onRefresh();
    });
    expect(triggerPullMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await flush();
    });
    expect(captured[captured.length - 1].refreshing).toBe(false);
    renderer.unmount();
  });
});
