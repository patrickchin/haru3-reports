import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { describe, it, expect, vi } from "vitest";
import {
  getDevFlags,
  setDevFlag,
  subscribeDevFlags,
  useDevFlags,
} from "./dev-flags";

// `DevFlags` is currently an empty open record; cast through `unknown`
// so tests can drive the generic setter/subscriber plumbing without
// requiring a concrete flag to land first.
const set = setDevFlag as unknown as (key: string, value: unknown) => void;

describe("dev-flags", () => {
  it("starts as an empty record", () => {
    expect(getDevFlags()).toEqual({});
  });

  it("subscribe/unsubscribe is well-formed", () => {
    const cb = vi.fn();
    const unsub = subscribeDevFlags(cb);
    expect(typeof unsub).toBe("function");
    unsub();
    expect(cb).not.toHaveBeenCalled();
  });

  it("setDevFlag updates state and notifies subscribers", () => {
    const cb = vi.fn();
    const unsub = subscribeDevFlags(cb);
    try {
      set("__test_flag", true);
      expect(cb).toHaveBeenCalledTimes(1);
      expect(getDevFlags()).toMatchObject({ __test_flag: true });
    } finally {
      // Reset state so other tests aren't polluted.
      set("__test_flag", undefined);
      unsub();
    }
  });

  it("setDevFlag is a no-op when the value is unchanged", () => {
    set("__noop_flag", 1);
    const cb = vi.fn();
    const unsub = subscribeDevFlags(cb);
    try {
      set("__noop_flag", 1);
      expect(cb).not.toHaveBeenCalled();
    } finally {
      set("__noop_flag", undefined);
      unsub();
    }
  });

  it("useDevFlags exposes the current state via useSyncExternalStore", () => {
    let observed: unknown;
    function Probe() {
      observed = useDevFlags();
      return null;
    }

    let tree: TestRenderer.ReactTestRenderer | undefined;
    act(() => {
      tree = TestRenderer.create(React.createElement(Probe));
    });
    try {
      expect(observed).toEqual(getDevFlags());

      act(() => {
        set("__hook_flag", "x");
      });
      expect(observed).toMatchObject({ __hook_flag: "x" });
    } finally {
      act(() => {
        set("__hook_flag", undefined);
      });
      tree?.unmount();
    }
  });
});
