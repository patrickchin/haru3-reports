import { assertEquals, assertThrows } from "jsr:@std/assert";

import {
  getAvailableProviders,
  getDefaultModel,
  getModel,
  isProviderKey,
  isValidModelForProvider,
} from "./providers.ts";

Deno.test("isProviderKey validates known providers", () => {
  assertEquals(isProviderKey("kimi"), true);
  assertEquals(isProviderKey("openai"), true);
  assertEquals(isProviderKey("not-a-provider"), false);
  assertEquals(isProviderKey(""), false);
});

Deno.test("provider model helpers expose defaults and validate model ids", () => {
  assertEquals(getDefaultModel("kimi"), "kimi-k2-0905-preview");
  assertEquals(isValidModelForProvider("kimi", "kimi-k2-0905-preview"), true);
  assertEquals(isValidModelForProvider("kimi", "gpt-4o-mini"), false);
});

Deno.test("getAvailableProviders checks provider-specific env keys", () => {
  const available = getAvailableProviders((key) => {
    if (key === "OPENAI_API_KEY") return "openai-key";
    if (key === "DEEPSEEK_API_KEY") return "deepseek-key";
    return undefined;
  });

  assertEquals(available, ["openai", "deepseek"]);
});

Deno.test("getModel throws a provider-specific error when the API key is missing", () => {
  assertThrows(
    () => getModel("openai", undefined, { getEnv: () => undefined }),
    Error,
    "OPENAI_API_KEY not set",
  );
});

Deno.test("getModel accepts API key overrides without reading env", () => {
  const result = getModel("openai", "gpt-4o", {
    apiKeyOverrides: { openai: "override-key" },
    getEnv: () => undefined,
  });

  assertEquals(result.modelId, "gpt-4o");
});

Deno.test("getModel falls back to the provider default for invalid model ids", () => {
  const result = getModel("deepseek", "not-a-model", {
    apiKeyOverrides: { deepseek: "deepseek-key" },
    getEnv: () => undefined,
  });

  assertEquals(result.modelId, "deepseek-chat");
});

Deno.test("getModel preserves legacy invalid-provider fallback to Kimi", () => {
  const result = getModel("not-a-provider", undefined, {
    apiKeyOverrides: { kimi: "kimi-key" },
    getEnv: () => undefined,
  });

  assertEquals(result.modelId, "kimi-k2-0905-preview");
});
