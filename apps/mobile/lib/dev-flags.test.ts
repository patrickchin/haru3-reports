import { describe, it, expect, vi } from "vitest";
import {
  getDevFlags,
  subscribeDevFlags,
} from "./dev-flags";

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
});
