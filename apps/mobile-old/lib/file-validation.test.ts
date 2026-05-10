import { describe, it, expect } from "vitest";
import {
  FILE_LIMITS,
  extensionFor,
  validateFile,
  type FileCategory,
} from "./file-validation";

describe("validateFile", () => {
  it("accepts a typical PDF document", () => {
    expect(
      validateFile("document", { mimeType: "application/pdf", sizeBytes: 1024 * 1024 }),
    ).toEqual({ valid: true });
  });

  it("rejects an unknown category", () => {
    const result = validateFile("nope" as FileCategory, {
      mimeType: "application/pdf",
      sizeBytes: 100,
    });
    expect(result.valid).toBe(false);
  });

  it("rejects empty mime type", () => {
    const result = validateFile("document", { mimeType: "", sizeBytes: 100 });
    expect(result).toEqual({ valid: false, reason: expect.stringContaining("mime") });
  });

  it("rejects zero-byte file", () => {
    const result = validateFile("document", {
      mimeType: "application/pdf",
      sizeBytes: 0,
    });
    expect(result).toEqual({ valid: false, reason: "File is empty" });
  });

  it("rejects negative size", () => {
    const result = validateFile("image", {
      mimeType: "image/png",
      sizeBytes: -1,
    });
    expect(result).toEqual({ valid: false, reason: "File is empty" });
  });

  it("rejects oversize image (10 MB cap)", () => {
    const result = validateFile("image", {
      mimeType: "image/jpeg",
      sizeBytes: 10 * 1024 * 1024 + 1,
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toContain("10.0 MB");
    }
  });

  it("accepts size exactly at the limit", () => {
    const result = validateFile("icon", {
      mimeType: "image/png",
      sizeBytes: FILE_LIMITS.icon.maxBytes,
    });
    expect(result).toEqual({ valid: true });
  });

  it("rejects an unsupported mime for the category", () => {
    const result = validateFile("icon", {
      mimeType: "image/heic", // not in icon allow-list
      sizeBytes: 1000,
    });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toContain("image/heic");
  });

  it("normalises mime case", () => {
    const result = validateFile("image", {
      mimeType: "IMAGE/PNG",
      sizeBytes: 1000,
    });
    expect(result).toEqual({ valid: true });
  });

  it("attachment category accepts any non-empty mime ('*')", () => {
    const result = validateFile("attachment", {
      mimeType: "application/x-weird-thing",
      sizeBytes: 100,
    });
    expect(result).toEqual({ valid: true });
  });

  it("voice-note accepts m4a", () => {
    const result = validateFile("voice-note", {
      mimeType: "audio/m4a",
      sizeBytes: 100_000,
    });
    expect(result).toEqual({ valid: true });
  });

  it("avatar accepts heic but not gif", () => {
    expect(
      validateFile("avatar", { mimeType: "image/heic", sizeBytes: 100 }).valid,
    ).toBe(true);
    expect(
      validateFile("avatar", { mimeType: "image/gif", sizeBytes: 100 }).valid,
    ).toBe(false);
  });
});

describe("extensionFor", () => {
  it("uses the filename extension when present", () => {
    expect(extensionFor("photo.JPG", "image/jpeg")).toBe("jpg");
  });

  it("falls back to mime when filename has no extension", () => {
    expect(extensionFor("photo", "image/png")).toBe("png");
  });

  it("falls back to mime when filename extension is implausibly long", () => {
    expect(extensionFor("weird.thisisnotanextension", "application/pdf")).toBe(
      "pdf",
    );
  });

  it("maps audio mimes correctly", () => {
    expect(extensionFor("rec", "audio/mp4")).toBe("m4a");
    expect(extensionFor("rec", "audio/mpeg")).toBe("mp3");
    expect(extensionFor("rec", "audio/wav")).toBe("wav");
    expect(extensionFor("rec", "audio/webm")).toBe("webm");
    expect(extensionFor("rec", "audio/ogg")).toBe("ogg");
  });

  it("returns 'bin' for unknown mimes without a filename ext", () => {
    expect(extensionFor("blob", "application/x-mystery")).toBe("bin");
  });
});
