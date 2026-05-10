import { describe, it, expect, vi } from "vitest";
import { newId } from "@/infra/ids";

describe("Smoke test", () => {
  it("generates UUIDs", () => {
    const id = newId();
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
  });

  it("accesses env vars", () => {
    const originalEnv = process.env.EXPO_PUBLIC_SUPABASE_URL;
    process.env.EXPO_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = "test-key";

    const { env } = await import("@/infra/env");
    expect(env.EXPO_PUBLIC_SUPABASE_URL).toBe("https://example.supabase.co");

    process.env.EXPO_PUBLIC_SUPABASE_URL = originalEnv;
  });
});
