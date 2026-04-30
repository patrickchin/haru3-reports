import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Mocks for expo-constants — must be set before importing the module under test.
const mockExpoConfig = vi.hoisted<{
  current: { version?: string; extra?: Record<string, unknown> } | null;
}>(() => ({ current: null }));

vi.mock("expo-constants", () => ({
  default: {
    get expoConfig() {
      return mockExpoConfig.current;
    },
  },
}));

const ORIGINAL_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;

beforeEach(() => {
  vi.resetModules();
  mockExpoConfig.current = null;
});

afterEach(() => {
  if (ORIGINAL_URL === undefined) {
    delete process.env.EXPO_PUBLIC_SUPABASE_URL;
  } else {
    process.env.EXPO_PUBLIC_SUPABASE_URL = ORIGINAL_URL;
  }
});

async function importBuildInfo() {
  return (await import("./build-info")).buildInfo;
}

describe("buildInfo", () => {
  it("returns sensible defaults when no expoConfig and no env are set", async () => {
    delete process.env.EXPO_PUBLIC_SUPABASE_URL;
    mockExpoConfig.current = null;
    const info = await importBuildInfo();
    expect(info.version).toBe("0.0.0");
    expect(info.gitCommit).toBe("unknown");
    expect(info.displayVersion).toBe("0.0.0+unknown");
    expect(info.buildTime).toBeUndefined();
    expect(info.serverLabel).toBe("unknown");
  });

  it("uses extra.gitCommit and extra.displayVersion when provided", async () => {
    mockExpoConfig.current = {
      version: "1.2.3",
      extra: {
        gitCommit: "abcdef0",
        displayVersion: "1.2.3+abcdef0",
        buildTime: "2026-04-30T00:00:00Z",
      },
    };
    const info = await importBuildInfo();
    expect(info.version).toBe("1.2.3");
    expect(info.gitCommit).toBe("abcdef0");
    expect(info.displayVersion).toBe("1.2.3+abcdef0");
    expect(info.buildTime).toBe("2026-04-30T00:00:00Z");
  });

  it("synthesises displayVersion from version + gitCommit when missing", async () => {
    mockExpoConfig.current = {
      version: "2.0.0",
      extra: { gitCommit: "1234567" },
    };
    const info = await importBuildInfo();
    expect(info.displayVersion).toBe("2.0.0+1234567");
  });

  it("labels localhost supabase URLs as Local", async () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
    const info = await importBuildInfo();
    expect(info.serverLabel).toBe("Local (127.0.0.1:54321)");
  });

  it("labels supabase.co cloud URLs as Cloud (project-ref)", async () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = "https://abcxyz.supabase.co";
    const info = await importBuildInfo();
    expect(info.serverLabel).toBe("Cloud (abcxyz)");
  });

  it("falls back to the raw URL string for unrecognised hosts", async () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = "https://staging.example.com";
    const info = await importBuildInfo();
    expect(info.serverLabel).toBe("https://staging.example.com");
  });
});
