import { describe, expect, it, beforeEach } from "vitest";
import { loadEnv, resetEnvForTesting } from "./env.js";

describe("loadEnv", () => {
  beforeEach(() => resetEnvForTesting());

  it("applies sensible defaults", () => {
    const env = loadEnv({});
    expect(env.NODE_ENV).toBe("development");
    expect(env.PORT).toBe(8080);
    expect(env.LOG_LEVEL).toBe("info");
    expect(env.ALLOWED_ORIGINS).toEqual([]);
  });

  it("parses ALLOWED_ORIGINS as a trimmed list", () => {
    const env = loadEnv({
      ALLOWED_ORIGINS: "https://a.example.com, https://b.example.com ,",
    });
    expect(env.ALLOWED_ORIGINS).toEqual([
      "https://a.example.com",
      "https://b.example.com",
    ]);
  });

  it("coerces PORT from string", () => {
    const env = loadEnv({ PORT: "9090" });
    expect(env.PORT).toBe(9090);
  });

  it("rejects an invalid LOG_LEVEL", () => {
    expect(() => loadEnv({ LOG_LEVEL: "shouty" })).toThrowError(
      /LOG_LEVEL/,
    );
  });

  it("requires DATABASE_URL and SUPABASE_URL in production", () => {
    expect(() => loadEnv({ NODE_ENV: "production" })).toThrowError(
      /DATABASE_URL.*SUPABASE_URL/,
    );
  });

  it("accepts production env when both required vars are set", () => {
    const env = loadEnv({
      NODE_ENV: "production",
      DATABASE_URL: "postgres://u:p@host:5432/db",
      SUPABASE_URL: "https://example.supabase.co",
    });
    expect(env.NODE_ENV).toBe("production");
  });
});
