import { describe, expect, it, vi } from "vitest";
import {
  computeIsDevPhoneAuthEnabled,
  getDevPhoneAuthOverride,
  getDemoCredentials,
  getSeedUsers,
  logClientError,
} from "./auth-security";

describe("computeIsDevPhoneAuthEnabled", () => {
  it("only enables demo auth in development builds", () => {
    expect(computeIsDevPhoneAuthEnabled(true, false)).toBe(true);
    expect(computeIsDevPhoneAuthEnabled(false, false)).toBe(false);
  });

  it("allows explicit opt-in for preview and test builds", () => {
    expect(computeIsDevPhoneAuthEnabled(false, true)).toBe(true);
  });
});

describe("getDevPhoneAuthOverride", () => {
  it("reads the public env flag", () => {
    vi.stubEnv("EXPO_PUBLIC_ENABLE_DEV_PHONE_AUTH", "true");

    expect(getDevPhoneAuthOverride()).toBe(true);

    vi.unstubAllEnvs();
  });
});

describe("getSeedUsers", () => {
  it("hides seeded demo users outside development", () => {
    expect(getSeedUsers(false)).toEqual([]);
    expect(getSeedUsers(true)).toHaveLength(3);
  });
});

describe("getDemoCredentials", () => {
  it("refuses demo credentials in production", () => {
    expect(() => getDemoCredentials(0, false)).toThrow(
      "Demo sign-in is unavailable in production builds.",
    );
  });

  it("returns seeded credentials when demo auth is enabled", () => {
    expect(getDemoCredentials(0, true)).toEqual({
      email: "mike@example.com",
      password: "test1234",
    });
    expect(getDemoCredentials(2, true)).toEqual({
      email: "charlie@example.com",
      password: "test1234",
    });
  });
});

describe("logClientError", () => {
  it("keeps detailed errors to development builds", () => {
    const logger = {
      error: vi.fn(),
      warn: vi.fn(),
    };
    const error = new Error("boom");

    logClientError("Failed to sync auth state", error, true, logger);

    expect(logger.error).toHaveBeenCalledWith("Failed to sync auth state", error);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("scrubs error details in production", () => {
    const logger = {
      error: vi.fn(),
      warn: vi.fn(),
    };

    logClientError("Failed to sync auth state", new Error("boom"), false, logger);

    expect(logger.warn).toHaveBeenCalledWith("Failed to sync auth state");
    expect(logger.error).not.toHaveBeenCalled();
  });
});
