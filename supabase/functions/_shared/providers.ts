import { createAnthropic } from "npm:@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "npm:@ai-sdk/google";
import { createOpenAI } from "npm:@ai-sdk/openai";
import { createOpenAICompatible } from "npm:@ai-sdk/openai-compatible";

export const VALID_PROVIDERS = [
  "kimi",
  "openai",
  "anthropic",
  "google",
  "zai",
  "deepseek",
] as const;

export type ProviderKey = (typeof VALID_PROVIDERS)[number];

export type ProviderModel = { id: string; label: string };

export const PROVIDER_ENV_KEYS: Record<ProviderKey, string> = {
  kimi: "MOONSHOT_API_KEY",
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  google: "GOOGLE_AI_API_KEY",
  zai: "ZAI_API_KEY",
  deepseek: "DEEPSEEK_API_KEY",
};

export const PROVIDER_MODELS: Record<ProviderKey, ProviderModel[]> = {
  kimi: [
    { id: "kimi-k2-0905-preview", label: "Kimi K2 (preview, 0905)" },
    { id: "kimi-k2-0711-preview", label: "Kimi K2 (preview, 0711)" },
    { id: "kimi-k2.6", label: "Kimi K2.6" },
    { id: "kimi-k2.5", label: "Kimi K2.5" },
    { id: "kimi-k2-turbo-preview", label: "Kimi K2 Turbo" },
    { id: "kimi-k2-thinking", label: "Kimi K2 Thinking" },
    { id: "kimi-k2-thinking-turbo", label: "Kimi K2 Thinking Turbo" },
  ],
  openai: [
    { id: "gpt-4o-mini", label: "GPT-4o mini" },
    { id: "gpt-4o", label: "GPT-4o" },
    { id: "gpt-4.1-mini", label: "GPT-4.1 mini" },
  ],
  anthropic: [
    { id: "claude-sonnet-4-20250514", label: "Claude Sonnet 4" },
    { id: "claude-haiku-4-5", label: "Claude Haiku 4.5" },
    { id: "claude-opus-4-1", label: "Claude Opus 4.1" },
  ],
  google: [
    { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
    { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
    { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
  ],
  zai: [
    { id: "glm-4.6", label: "GLM-4.6" },
    { id: "glm-4-air", label: "GLM-4 Air" },
  ],
  deepseek: [
    { id: "deepseek-chat", label: "DeepSeek V3 (chat)" },
    { id: "deepseek-reasoner", label: "DeepSeek R1 (reasoner)" },
  ],
};

export type GetEnvFn = (name: string) => string | undefined;

export type GetModelOptions = {
  defaultModels?: Partial<Record<ProviderKey, string>>;
  apiKeyOverrides?: Partial<Record<ProviderKey, string>>;
  getEnv?: GetEnvFn;
};

export function isProviderKey(provider: string): provider is ProviderKey {
  return VALID_PROVIDERS.includes(provider as ProviderKey);
}

export function getDefaultModel(provider: ProviderKey): string {
  return PROVIDER_MODELS[provider][0].id;
}

export function isValidModelForProvider(
  provider: ProviderKey,
  model: string,
): boolean {
  return PROVIDER_MODELS[provider].some((m) => m.id === model);
}

export function getAvailableProviders(
  getEnv: GetEnvFn = (key) => Deno.env.get(key) ?? undefined,
): string[] {
  return VALID_PROVIDERS.filter((p) => Boolean(getEnv(PROVIDER_ENV_KEYS[p])));
}

export function getModel(
  provider: string,
  modelId?: string,
  opts: GetModelOptions = {},
) {
  // Keep legacy AI_PROVIDER behavior: an unknown provider falls back to Kimi.
  // Request handlers still validate client-supplied providers before this point.
  const p = isProviderKey(provider) ? provider : "kimi";
  const list = PROVIDER_MODELS[p];
  const defaultModel = opts.defaultModels?.[p] ?? list[0].id;
  const resolvedModel = modelId && list.some((m) => m.id === modelId)
    ? modelId
    : defaultModel;
  const getEnv = opts.getEnv ?? ((key) => Deno.env.get(key) ?? undefined);
  const apiKey = opts.apiKeyOverrides?.[p] || getEnv(PROVIDER_ENV_KEYS[p]);

  if (!apiKey) throw new Error(`${PROVIDER_ENV_KEYS[p]} not set`);

  switch (p) {
    case "openai":
      return {
        instance: createOpenAI({ apiKey })(resolvedModel),
        modelId: resolvedModel,
      };
    case "anthropic":
      return {
        instance: createAnthropic({ apiKey })(resolvedModel),
        modelId: resolvedModel,
      };
    case "google":
      return {
        instance: createGoogleGenerativeAI({ apiKey })(resolvedModel),
        modelId: resolvedModel,
      };
    case "zai":
      return {
        instance: createOpenAICompatible({
          name: "zai",
          baseURL: "https://api.z.ai/api/paas/v4",
          apiKey,
        })(resolvedModel),
        modelId: resolvedModel,
      };
    case "deepseek":
      return {
        instance: createOpenAICompatible({
          name: "deepseek",
          baseURL: "https://api.deepseek.com/v1",
          apiKey,
        })(resolvedModel),
        modelId: resolvedModel,
      };
    case "kimi":
      return {
        instance: createOpenAICompatible({
          name: "kimi",
          baseURL: "https://api.moonshot.cn/v1",
          apiKey,
        })(resolvedModel),
        modelId: resolvedModel,
      };
  }
}
