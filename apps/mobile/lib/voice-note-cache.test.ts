import { describe, expect, it, vi } from "vitest";
import {
  seedVoiceNoteCache,
  toVoiceNoteCacheFilename,
  getVoiceNoteCacheUri,
  type VoiceNoteCacheFs,
} from "./voice-note-cache";

function makeFs(overrides: Partial<VoiceNoteCacheFs> = {}): VoiceNoteCacheFs {
  return {
    cacheDirectory: "file:///cache/",
    getInfoAsync: vi.fn(async () => ({ exists: false })),
    makeDirectoryAsync: vi.fn(async () => undefined),
    copyAsync: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe("toVoiceNoteCacheFilename", () => {
  it("flattens slashes and other unsafe chars to underscores", () => {
    expect(toVoiceNoteCacheFilename("p-1/voice/abc.m4a")).toBe(
      "p-1_voice_abc.m4a",
    );
  });

  it("keeps alphanumerics, dots, underscores, hyphens", () => {
    expect(toVoiceNoteCacheFilename("a-1.b_2.m4a")).toBe("a-1.b_2.m4a");
  });
});

describe("getVoiceNoteCacheUri", () => {
  it("composes the canonical cache URI", () => {
    expect(getVoiceNoteCacheUri("p/v/x.m4a", makeFs())).toBe(
      "file:///cache/voice-notes/p_v_x.m4a",
    );
  });

  it("returns null when the platform has no cache directory", () => {
    expect(
      getVoiceNoteCacheUri("p/v/x.m4a", makeFs({ cacheDirectory: null })),
    ).toBeNull();
  });
});

describe("seedVoiceNoteCache", () => {
  it("copies the local recording into the cache under the canonical filename", async () => {
    const fs = makeFs();
    const ok = await seedVoiceNoteCache(
      "p-1/voice/abc.m4a",
      "file:///recording.m4a",
      fs,
    );
    expect(ok).toBe(true);
    expect(fs.makeDirectoryAsync).toHaveBeenCalledWith(
      "file:///cache/voice-notes/",
      { intermediates: true },
    );
    expect(fs.copyAsync).toHaveBeenCalledWith({
      from: "file:///recording.m4a",
      to: "file:///cache/voice-notes/p-1_voice_abc.m4a",
    });
  });

  it("skips the copy when the cache file already exists", async () => {
    const fs = makeFs({
      getInfoAsync: vi.fn(async () => ({ exists: true })),
    });
    const ok = await seedVoiceNoteCache("p/v/x.m4a", "file:///rec.m4a", fs);
    expect(ok).toBe(true);
    expect(fs.copyAsync).not.toHaveBeenCalled();
    expect(fs.makeDirectoryAsync).not.toHaveBeenCalled();
  });

  it("returns false (and never throws) when the copy fails", async () => {
    const fs = makeFs({
      copyAsync: vi.fn(async () => {
        throw new Error("disk full");
      }),
    });
    const ok = await seedVoiceNoteCache("p/v/x.m4a", "file:///rec.m4a", fs);
    expect(ok).toBe(false);
  });

  it("returns false when the platform has no cache directory", async () => {
    const fs = makeFs({ cacheDirectory: null });
    const ok = await seedVoiceNoteCache("p/v/x.m4a", "file:///rec.m4a", fs);
    expect(ok).toBe(false);
    expect(fs.copyAsync).not.toHaveBeenCalled();
  });

  it("returns false on empty inputs without touching the filesystem", async () => {
    const fs = makeFs();
    expect(await seedVoiceNoteCache("", "file:///rec.m4a", fs)).toBe(false);
    expect(await seedVoiceNoteCache("p/v/x.m4a", "", fs)).toBe(false);
    expect(fs.copyAsync).not.toHaveBeenCalled();
  });
});

describe("voice-note-cache default expo-file-system fs adapter", () => {
  it("delegates to expo-file-system/legacy when no fs is injected", async () => {
    const fs = await import("expo-file-system/legacy");
    const fsMock = fs as unknown as {
      cacheDirectory: string | null;
      getInfoAsync: ReturnType<typeof vi.fn>;
      makeDirectoryAsync: ReturnType<typeof vi.fn>;
      copyAsync: ReturnType<typeof vi.fn>;
    };
    // The setup file mocks all these; pin the cache dir to a known value.
    Object.defineProperty(fsMock, "cacheDirectory", {
      value: "file:///cache/",
      configurable: true,
    });
    fsMock.getInfoAsync.mockResolvedValueOnce({ exists: false });
    fsMock.makeDirectoryAsync.mockResolvedValueOnce(undefined);
    fsMock.copyAsync.mockResolvedValueOnce(undefined);

    const ok = await seedVoiceNoteCache(
      "p-1/voice/abc.m4a",
      "file:///recording.m4a",
    );
    expect(ok).toBe(true);
    expect(fsMock.makeDirectoryAsync).toHaveBeenCalledWith(
      "file:///cache/voice-notes/",
      { intermediates: true },
    );
    expect(fsMock.copyAsync).toHaveBeenCalledWith({
      from: "file:///recording.m4a",
      to: "file:///cache/voice-notes/p-1_voice_abc.m4a",
    });

    // Default-fs path also exercises the cacheDirectory getter.
    expect(getVoiceNoteCacheUri("p-1/voice/abc.m4a")).toBe(
      "file:///cache/voice-notes/p-1_voice_abc.m4a",
    );
  });

  it("returns null from getVoiceNoteCacheUri when expo-file-system has no cacheDirectory", async () => {
    const fs = await import("expo-file-system/legacy");
    const fsMock = fs as unknown as { cacheDirectory: string | null };
    Object.defineProperty(fsMock, "cacheDirectory", {
      value: null,
      configurable: true,
    });
    expect(getVoiceNoteCacheUri("p/v/x.m4a")).toBeNull();
  });
});
