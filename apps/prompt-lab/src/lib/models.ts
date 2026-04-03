import type { ModelConfig } from '../types'

export const MODEL_REGISTRY: ModelConfig[] = [
  // OpenAI
  {
    id: 'gpt-4o',
    provider: 'openai',
    displayName: 'GPT-4o',
    contextWindow: 128_000,
    maxOutputTokens: 16_384,
    inputPricePer1M: 2.5,
    outputPricePer1M: 10.0,
  },
  {
    id: 'gpt-4o-mini',
    provider: 'openai',
    displayName: 'GPT-4o mini',
    contextWindow: 128_000,
    maxOutputTokens: 16_384,
    inputPricePer1M: 0.15,
    outputPricePer1M: 0.6,
  },
  {
    id: 'gpt-4.1',
    provider: 'openai',
    displayName: 'GPT-4.1',
    contextWindow: 1_000_000,
    maxOutputTokens: 32_768,
    inputPricePer1M: 2.0,
    outputPricePer1M: 8.0,
  },
  {
    id: 'o4-mini',
    provider: 'openai',
    displayName: 'o4-mini',
    contextWindow: 200_000,
    maxOutputTokens: 65_536,
    inputPricePer1M: 1.1,
    outputPricePer1M: 4.4,
  },
  // Moonshot (Kimi)
  {
    id: 'moonshot-v1-8k',
    provider: 'moonshot',
    displayName: 'Moonshot 8k',
    contextWindow: 8_192,
    maxOutputTokens: 4_096,
    inputPricePer1M: 1.63,
    outputPricePer1M: 4.89,
  },
  {
    id: 'moonshot-v1-32k',
    provider: 'moonshot',
    displayName: 'Moonshot 32k',
    contextWindow: 32_768,
    maxOutputTokens: 4_096,
    inputPricePer1M: 3.26,
    outputPricePer1M: 9.77,
  },
  {
    id: 'moonshot-v1-128k',
    provider: 'moonshot',
    displayName: 'Moonshot 128k',
    contextWindow: 131_072,
    maxOutputTokens: 4_096,
    inputPricePer1M: 8.15,
    outputPricePer1M: 24.44,
  },
  // Anthropic
  {
    id: 'claude-opus-4-5',
    provider: 'anthropic',
    displayName: 'Claude Opus 4.5',
    contextWindow: 200_000,
    maxOutputTokens: 8_192,
    inputPricePer1M: 15.0,
    outputPricePer1M: 75.0,
  },
  {
    id: 'claude-sonnet-4-5',
    provider: 'anthropic',
    displayName: 'Claude Sonnet 4.5',
    contextWindow: 200_000,
    maxOutputTokens: 8_192,
    inputPricePer1M: 3.0,
    outputPricePer1M: 15.0,
  },
  {
    id: 'claude-haiku-3-5',
    provider: 'anthropic',
    displayName: 'Claude Haiku 3.5',
    contextWindow: 200_000,
    maxOutputTokens: 8_192,
    inputPricePer1M: 0.8,
    outputPricePer1M: 4.0,
  },
]

export function findModel(id: string): ModelConfig | undefined {
  return MODEL_REGISTRY.find((m) => m.id === id)
}
