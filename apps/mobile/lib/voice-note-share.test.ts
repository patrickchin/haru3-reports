import { beforeEach, describe, expect, it, vi } from "vitest";

const { fs, sharing, voiceNoteCache } = vi.hoisted(() => ({
  fs: {
    getInfoAsync: vi.fn(),
  },
  sharing: {
    isAvailableAsync: vi.fn(),
    shareAsync: vi.fn(),
  },
  voiceNoteCache: {
    getVoiceNoteCacheUri: vi.fn(),
  },
}));

vi.mock("expo-file-system/legacy", () => fs);
vi.mock("expo-sharing", () => sharing);
vi.mock("@/lib/voice-note-cache", () => voiceNoteCache);

import { shareVoiceNote } from "./voice-note-share";

const baseArgs = {
  storagePath: "user/recording-123.m4a",
  intent: "share" as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  voiceNoteCache.getVoiceNoteCacheUri.mockReturnValue(
    "file:///cache/voice-notes/user_recording-123.m4a",
  );
  fs.getInfoAsync.mockResolvedValue({ exists: true });
  sharing.isAvailableAsync.mockResolvedValue(true);
  sharing.shareAsync.mockResolvedValue(undefined);
});

describe("shareVoiceNote", () => {
  it("shares the cached audio with the share dialog title", async () => {
    await shareVoiceNote({ ...baseArgs, mimeType: "audio/mp4" });

    expect(sharing.shareAsync).toHaveBeenCalledWith(
      "file:///cache/voice-notes/user_recording-123.m4a",
      {
        mimeType: "audio/mp4",
        UTI: "public.audio",
        dialogTitle: "Share voice note",
      },
    );
  });

  it("uses the download dialog title for the download intent", async () => {
    await shareVoiceNote({ ...baseArgs, intent: "download" });

    expect(sharing.shareAsync).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ dialogTitle: "Save voice note" }),
    );
  });

  it("falls back to audio/m4a when no mime type is provided", async () => {
    await shareVoiceNote(baseArgs);

    expect(sharing.shareAsync).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ mimeType: "audio/m4a" }),
    );
  });

  it("throws when the platform has no cache directory", async () => {
    voiceNoteCache.getVoiceNoteCacheUri.mockReturnValueOnce(null);

    await expect(shareVoiceNote(baseArgs)).rejects.toThrow(
      /Local cache is unavailable/,
    );
    expect(sharing.shareAsync).not.toHaveBeenCalled();
  });

  it("throws when the cache file does not exist yet", async () => {
    fs.getInfoAsync.mockResolvedValueOnce({ exists: false });

    await expect(shareVoiceNote(baseArgs)).rejects.toThrow(
      /Voice note is not cached yet/,
    );
    expect(sharing.shareAsync).not.toHaveBeenCalled();
  });

  it("throws when sharing is unavailable", async () => {
    sharing.isAvailableAsync.mockResolvedValueOnce(false);

    await expect(shareVoiceNote(baseArgs)).rejects.toThrow(
      /Sharing is not available/,
    );
    expect(sharing.shareAsync).not.toHaveBeenCalled();
  });
});
