import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../backend", () => ({
  backend: { auth: { getSession: vi.fn() } },
}));

const ORIGINAL = process.env.EXPO_PUBLIC_USE_REST_API;

beforeEach(() => {
  delete process.env.EXPO_PUBLIC_USE_REST_API;
});

afterEach(() => {
  if (ORIGINAL === undefined) {
    delete process.env.EXPO_PUBLIC_USE_REST_API;
  } else {
    process.env.EXPO_PUBLIC_USE_REST_API = ORIGINAL;
  }
});

describe("getBridgeMode", () => {
  it("returns 'supabase' by default", async () => {
    const { getBridgeMode } = await import("./bridge-factory");
    expect(getBridgeMode()).toBe("supabase");
  });

  it("returns 'rest' when flag is '1'", async () => {
    process.env.EXPO_PUBLIC_USE_REST_API = "1";
    const { getBridgeMode } = await import("./bridge-factory");
    expect(getBridgeMode()).toBe("rest");
  });

  it("returns 'supabase' for any non-'1' value", async () => {
    process.env.EXPO_PUBLIC_USE_REST_API = "0";
    const { getBridgeMode } = await import("./bridge-factory");
    expect(getBridgeMode()).toBe("supabase");

    process.env.EXPO_PUBLIC_USE_REST_API = "true";
    const mod2 = await import("./bridge-factory");
    expect(mod2.getBridgeMode()).toBe("supabase");
  });
});
