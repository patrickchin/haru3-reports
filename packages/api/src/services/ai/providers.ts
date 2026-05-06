/**
 * AI provider registry for report generation.
 *
 * Ported from `supabase/functions/generate-report/index.ts` so the REST
 * API can produce reports without going through the edge function.
 *
 * Mirrors the edge function's provider list, env keys, and default
 * models exactly — clients should see identical behaviour.
 */
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";

export const VALID_PROVIDERS = [
  "kimi",
  "openai",
  "anthropic",
  "google",
  "zai",
  "deepseek",
] as const;

export type ProviderKey = (typeof VALID_PROVIDERS)[number];

const PROVIDER_ENV_KEYS: Record<ProviderKey, string> = {
  kimi: "MOONSHOT_API_KEY",
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  google: "GOOGLE_AI_API_KEY",
  zai: "ZAI_API_KEY",
  deepseek: "DEEPSEEK_API_KEY",
};

export const PROVIDER_MODELS: Record<
  ProviderKey,
  { id: string; label: string }[]
> = {
  kimi: [
    { id: "kimi-k2-0711-preview", label: "Kimi K2 (preview)" },
    { id: "moonshot-v1-32k", label: "Moonshot v1 32k" },
    { id: "moonshot-v1-128k", label: "Moonshot v1 128k" },
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

export function isValidProvider(value: string): value is ProviderKey {
  return (VALID_PROVIDERS as readonly string[]).includes(value);
}

export function getDefaultModel(provider: ProviderKey): string {
  const first = PROVIDER_MODELS[provider][0];
  if (!first) throw new Error(`No models configured for provider ${provider}`);
  return first.id;
}

export function isValidModelForProvider(
  provider: ProviderKey,
  model: string,
): boolean {
  return PROVIDER_MODELS[provider].some((m) => m.id === model);
}

export function getAvailableProviders(): ProviderKey[] {
  return VALID_PROVIDERS.filter((p) => Boolean(process.env[PROVIDER_ENV_KEYS[p]]));
}

export interface ResolvedModel {
  readonly instance: unknown;
  readonly modelId: string;
}

export function getModel(provider: string, modelId?: string): ResolvedModel {
  if (!isValidProvider(provider)) {
    throw new Error(`Unknown provider: ${provider}`);
  }
  const valid = modelId && isValidModelForProvider(provider, modelId);
  const resolvedModel = valid ? modelId : getDefaultModel(provider);
  const envKey = PROVIDER_ENV_KEYS[provider];
  const apiKey = process.env[envKey];
  if (!apiKey) throw new Error(`${envKey} not set`);

  switch (provider) {
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
    case "kimi":
      return {
        instance: createOpenAICompatible({
          name: "kimi",
          baseURL: "https://api.moonshot.cn/v1",
          apiKey,
        })(resolvedModel),
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
  }
}
