import { beforeEach, describe, expect, it } from "vitest";
import { resetEnvForTesting } from "../env.js";
import { getJwks, resetJwksForTesting } from "./jwks.js";

describe("getJwks", () => {
  beforeEach(() => {
    resetEnvForTesting();
    resetJwksForTesting();
    delete process.env.SUPABASE_URL;
  });

  it("throws when SUPABASE_URL is not configured", () => {
    process.env.NODE_ENV = "development";
    expect(() => getJwks()).toThrowError(/SUPABASE_URL/);
  });

  it("memoises the resolver across calls", () => {
    process.env.NODE_ENV = "development";
    process.env.SUPABASE_URL = "https://example.supabase.co";
    const first = getJwks();
    const second = getJwks();
    expect(second).toBe(first);
  });
});
