import { describe, it, expect, vi, afterEach } from "vitest";

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("isoClock", () => {
  it("returns the current time as an ISO 8601 string", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-30T12:34:56.789Z"));
    const { isoClock } = await import("./clock");
    expect(isoClock()).toBe("2026-04-30T12:34:56.789Z");
  });
});

describe("randomId", () => {
  it("delegates to crypto.randomUUID when available", async () => {
    const cryptoSpy = vi
      .spyOn(globalThis.crypto, "randomUUID")
      .mockReturnValue("00000000-0000-4000-8000-000000000000");
    const { randomId } = await import("./clock");
    expect(randomId()).toBe("00000000-0000-4000-8000-000000000000");
    expect(cryptoSpy).toHaveBeenCalledTimes(1);
  });

  it("falls back to a RFC 4122 v4 form when crypto.randomUUID is missing", async () => {
    // Simulate a runtime without crypto.randomUUID by deleting it temporarily.
    const original = globalThis.crypto.randomUUID;
    Object.defineProperty(globalThis.crypto, "randomUUID", {
      value: undefined,
      configurable: true,
    });
    try {
      const { randomId } = await import("./clock");
      const id = randomId();
      // 8-4-4-4-12 hex pattern
      expect(id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
      // version 4 nibble
      expect(id[14]).toBe("4");
      // variant bits => 8, 9, a, or b
      expect("89ab").toContain(id[19]);
    } finally {
      Object.defineProperty(globalThis.crypto, "randomUUID", {
        value: original,
        configurable: true,
      });
    }
  });

  it("produces unique IDs across multiple calls in the fallback path", async () => {
    const original = globalThis.crypto.randomUUID;
    Object.defineProperty(globalThis.crypto, "randomUUID", {
      value: undefined,
      configurable: true,
    });
    try {
      const { randomId } = await import("./clock");
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) ids.add(randomId());
      expect(ids.size).toBe(100);
    } finally {
      Object.defineProperty(globalThis.crypto, "randomUUID", {
        value: original,
        configurable: true,
      });
    }
  });
});
