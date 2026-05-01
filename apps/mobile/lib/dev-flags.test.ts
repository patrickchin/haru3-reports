import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getDevFlags,
  setDevFlag,
  subscribeDevFlags,
} from "./dev-flags";

describe("dev-flags", () => {
  beforeEach(() => {
    setDevFlag("forceOffline", false);
  });

  it("starts with forceOffline=false", () => {
    expect(getDevFlags().forceOffline).toBe(false);
  });

  it("setDevFlag updates the value", () => {
    setDevFlag("forceOffline", true);
    expect(getDevFlags().forceOffline).toBe(true);
  });

  it("setDevFlag is a no-op when value is unchanged (preserves identity)", () => {
    const before = getDevFlags();
    setDevFlag("forceOffline", false);
    expect(getDevFlags()).toBe(before);
  });

  it("subscribers are notified on change", () => {
    const cb = vi.fn();
    const unsub = subscribeDevFlags(cb);
    setDevFlag("forceOffline", true);
    expect(cb).toHaveBeenCalledTimes(1);
    setDevFlag("forceOffline", true); // no-op
    expect(cb).toHaveBeenCalledTimes(1);
    setDevFlag("forceOffline", false);
    expect(cb).toHaveBeenCalledTimes(2);
    unsub();
    setDevFlag("forceOffline", true);
    expect(cb).toHaveBeenCalledTimes(2);
  });
});
