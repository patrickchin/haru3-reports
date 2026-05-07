import { describe, expect, it, afterEach } from "vitest";
import { safeRandomUUID } from "./uuid";

describe("safeRandomUUID", () => {
  const originalCrypto = (globalThis as { crypto?: unknown }).crypto;

  afterEach(() => {
    // Restore whatever the runtime had originally.
    Object.defineProperty(globalThis, "crypto", {
      value: originalCrypto,
      configurable: true,
      writable: true,
    });
  });

  it("uses crypto.randomUUID when available", () => {
    Object.defineProperty(globalThis, "crypto", {
      value: { randomUUID: () => "11111111-2222-3333-4444-555555555555" },
      configurable: true,
      writable: true,
    });
    expect(safeRandomUUID()).toBe("11111111-2222-3333-4444-555555555555");
  });

  // Regression: Hermes release builds on iOS do not expose globalThis.crypto.
  // Tapping "New Report" called `globalThis.crypto.randomUUID()` directly and
  // crashed the app with "Cannot read property 'randomUUID' of undefined".
  it("does not throw when globalThis.crypto is undefined", () => {
    Object.defineProperty(globalThis, "crypto", {
      value: undefined,
      configurable: true,
      writable: true,
    });
    const id = safeRandomUUID();
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(0);
  });

  it("does not throw when crypto exists but lacks randomUUID", () => {
    Object.defineProperty(globalThis, "crypto", {
      value: {},
      configurable: true,
      writable: true,
    });
    const id = safeRandomUUID();
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(0);
  });
});
