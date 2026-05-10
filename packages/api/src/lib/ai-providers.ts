/**
 * AI provider factory for the v3 Hono API.
 * Ported from supabase/functions/_shared/providers.ts (Deno → Node).
 */
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { AI_PROVIDERS, PROVIDER_MODELS, DEFAULT_PROVIDER } from '@harpa/api-contract';
import type { AiProvider } from '@harpa/api-contract';

export const PROVIDER_ENV_KEYS: Record<AiProvider, string> = {
  kimi: 'MOONSHOT_API_KEY',
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  google: 'GOOGLE_AI_API_KEY',
  zai: 'ZAI_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
};

export function isProviderKey(provider: string): provider is AiProvider {
  return (AI_PROVIDERS as readonly string[]).includes(provider);
}

export function getDefaultModel(provider: AiProvider): string {
  return PROVIDER_MODELS[provider].default;
}

export function isValidModelForProvider(provider: AiProvider, model: string): boolean {
  return PROVIDER_MODELS[provider].available.includes(model);
}

export function getAvailableProviders(): AiProvider[] {
  return AI_PROVIDERS.filter((p) => Boolean(process.env[PROVIDER_ENV_KEYS[p]]));
}

export type GetModelResult = { instance: unknown; modelId: string };

export type GetModelOptions = {
  defaultModels?: Partial<Record<AiProvider, string>>;
};

export function getModel(
  provider: string,
  modelId?: string,
  opts: GetModelOptions = {},
): GetModelResult {
  const p = isProviderKey(provider) ? provider : DEFAULT_PROVIDER;
  const models = PROVIDER_MODELS[p];
  const defaultModel = opts.defaultModels?.[p] ?? models.default;
  const resolvedModel =
    modelId && models.available.includes(modelId) ? modelId : defaultModel;
  const apiKey = process.env[PROVIDER_ENV_KEYS[p]];

  if (!apiKey) throw new Error(`${PROVIDER_ENV_KEYS[p]} not set`);

  switch (p) {
    case 'openai':
      return { instance: createOpenAI({ apiKey })(resolvedModel), modelId: resolvedModel };
    case 'anthropic':
      return { instance: createAnthropic({ apiKey })(resolvedModel), modelId: resolvedModel };
    case 'google':
      return {
        instance: createGoogleGenerativeAI({ apiKey })(resolvedModel),
        modelId: resolvedModel,
      };
    case 'zai':
      return {
        instance: createOpenAICompatible({
          name: 'zai',
          baseURL: 'https://api.z.ai/api/paas/v4',
          apiKey,
        })(resolvedModel),
        modelId: resolvedModel,
      };
    case 'deepseek':
      return {
        instance: createOpenAICompatible({
          name: 'deepseek',
          baseURL: 'https://api.deepseek.com/v1',
          apiKey,
        })(resolvedModel),
        modelId: resolvedModel,
      };
    case 'kimi':
      return {
        instance: createOpenAICompatible({
          name: 'kimi',
          baseURL: 'https://api.moonshot.cn/v1',
          apiKey,
        })(resolvedModel),
        modelId: resolvedModel,
      };
  }
}
