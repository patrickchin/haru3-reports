/**
 * Tests for transcription provider registry.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  PROVIDERS,
  listAvailableProviders,
  resolveProvider,
} from "./providers.js";

const ENV_KEYS = [
  "OPENAI_API_KEY",
  "GROQ_API_KEY",
  "DEEPGRAM_API_KEY",
  "TRANSCRIPTION_PROVIDER",
];

beforeEach(() => {
  for (const k of ENV_KEYS) delete process.env[k];
});
afterEach(() => {
  for (const k of ENV_KEYS) delete process.env[k];
});

describe("PROVIDERS", () => {
  it("contains the expected providers", () => {
    expect(Object.keys(PROVIDERS).sort()).toEqual([
      "deepgram",
      "groq",
      "openai",
      "openai-whisper",
    ]);
  });
});

describe("listAvailableProviders", () => {
  it("filters by env keys present", () => {
    process.env["GROQ_API_KEY"] = "x";
    expect(listAvailableProviders()).toEqual(["groq"]);
  });
  it("returns multiple when multiple env keys set", () => {
    process.env["GROQ_API_KEY"] = "x";
    process.env["OPENAI_API_KEY"] = "y";
    const ids = listAvailableProviders().sort();
    expect(ids).toEqual(["groq", "openai", "openai-whisper"]);
  });
});

describe("resolveProvider", () => {
  it("defaults to groq when nothing requested or env'd", () => {
    expect(resolveProvider().id).toBe("groq");
  });
  it("respects explicit request", () => {
    expect(resolveProvider("deepgram").id).toBe("deepgram");
  });
  it("respects TRANSCRIPTION_PROVIDER env", () => {
    process.env["TRANSCRIPTION_PROVIDER"] = "openai";
    expect(resolveProvider().id).toBe("openai");
  });
  it("throws on unknown provider", () => {
    expect(() => resolveProvider("bogus")).toThrow(/Unknown transcription/);
  });
  it("is case-insensitive", () => {
    expect(resolveProvider("GROQ").id).toBe("groq");
  });
});
