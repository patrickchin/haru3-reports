import * as Crypto from "expo-crypto";
import { describe, expect, it, afterEach, vi } from "vitest";
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
    vi.mocked(Crypto.randomUUID).mockClear();
    vi.restoreAllMocks();
  });

  it("uses crypto.randomUUID when available", () => {
    Object.defineProperty(globalThis, "crypto", {
      value: { randomUUID: () => "11111111-2222-3333-4444-555555555555" },
      configurable: true,
      writable: true,
    });
    expect(safeRandomUUID()).toBe("11111111-2222-3333-4444-555555555555");
  });

  // RFC 4122 v4: 8-4-4-4-12 hex chars, version nibble = 4, variant nibble in [8,9,a,b].
  const UUID_V4 =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

  it("uses expo-crypto when globalThis.crypto is undefined", () => {
    Object.defineProperty(globalThis, "crypto", {
      value: undefined,
      configurable: true,
      writable: true,
    });
    vi.mocked(Crypto.randomUUID).mockReturnValue(
      "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    );
    const id = safeRandomUUID();
    expect(id).toBe("aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee");
    expect(Crypto.randomUUID).toHaveBeenCalledOnce();
  });

  it("uses expo-crypto when crypto exists but lacks randomUUID", () => {
    Object.defineProperty(globalThis, "crypto", {
      value: {},
      configurable: true,
      writable: true,
    });
    vi.mocked(Crypto.randomUUID).mockReturnValue(
      "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff",
    );
    const id = safeRandomUUID();
    expect(id).toBe("bbbbbbbb-cccc-4ddd-8eee-ffffffffffff");
    expect(Crypto.randomUUID).toHaveBeenCalledOnce();
  });

  it("does not use Math.random for UUID fallback", () => {
    Object.defineProperty(globalThis, "crypto", {
      value: undefined,
      configurable: true,
      writable: true,
    });
    const mathRandomSpy = vi.spyOn(Math, "random");

    expect(safeRandomUUID()).toMatch(UUID_V4);
    expect(mathRandomSpy).not.toHaveBeenCalled();
  });
});
