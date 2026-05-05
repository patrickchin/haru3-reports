/**
 * Tests for AI provider registry.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  PROVIDER_MODELS,
  VALID_PROVIDERS,
  getAvailableProviders,
  getDefaultModel,
  getModel,
  isValidModelForProvider,
  isValidProvider,
} from "./providers.js";

const ENV_KEYS = [
  "MOONSHOT_API_KEY",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "GOOGLE_AI_API_KEY",
  "ZAI_API_KEY",
  "DEEPSEEK_API_KEY",
];

beforeEach(() => {
  for (const k of ENV_KEYS) delete process.env[k];
});
afterEach(() => {
  for (const k of ENV_KEYS) delete process.env[k];
});

describe("isValidProvider", () => {
  it("accepts every VALID_PROVIDERS entry", () => {
    for (const p of VALID_PROVIDERS) expect(isValidProvider(p)).toBe(true);
  });
  it("rejects unknown providers", () => {
    expect(isValidProvider("openrouter")).toBe(false);
    expect(isValidProvider("KIMI")).toBe(false);
  });
});

describe("PROVIDER_MODELS", () => {
  it("has at least one model per provider", () => {
    for (const p of VALID_PROVIDERS) {
      expect(PROVIDER_MODELS[p].length).toBeGreaterThan(0);
    }
  });
});

describe("getDefaultModel", () => {
  it("returns first model id", () => {
    expect(getDefaultModel("kimi")).toBe("kimi-k2-0711-preview");
    expect(getDefaultModel("openai")).toBe("gpt-4o-mini");
  });
});

describe("isValidModelForProvider", () => {
  it("matches model ids exactly", () => {
    expect(isValidModelForProvider("openai", "gpt-4o")).toBe(true);
    expect(isValidModelForProvider("openai", "gpt-3.5")).toBe(false);
  });
});

describe("getAvailableProviders", () => {
  it("returns providers whose env keys are set", () => {
    process.env["MOONSHOT_API_KEY"] = "x";
    process.env["OPENAI_API_KEY"] = "y";
    expect(getAvailableProviders().sort()).toEqual(["kimi", "openai"]);
  });
});

describe("getModel", () => {
  it("throws on unknown provider", () => {
    expect(() => getModel("bogus")).toThrow(/Unknown provider/);
  });
  it("throws when env key is missing", () => {
    expect(() => getModel("openai")).toThrow(/OPENAI_API_KEY not set/);
  });
  it("returns the requested model when env key is set", () => {
    process.env["MOONSHOT_API_KEY"] = "test";
    const m = getModel("kimi", "moonshot-v1-32k");
    expect(m.modelId).toBe("moonshot-v1-32k");
  });
  it("falls back to default model when requested is invalid", () => {
    process.env["MOONSHOT_API_KEY"] = "test";
    const m = getModel("kimi", "totally-bogus");
    expect(m.modelId).toBe("kimi-k2-0711-preview");
  });
});
