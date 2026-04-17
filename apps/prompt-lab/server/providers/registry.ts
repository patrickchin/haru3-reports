import type { LLMProvider } from './types'
import { OpenAIProvider } from './openai'
import { AnthropicProvider } from './anthropic'
import { MoonshotProvider } from './moonshot'

const providers: LLMProvider[] = [new OpenAIProvider(), new AnthropicProvider(), new MoonshotProvider()]

export function findProvider(modelId: string): LLMProvider | undefined {
  return providers.find((p) => p.supportedModels.includes(modelId))
}

export function listModels(): string[] {
  return providers.flatMap((p) => p.supportedModels)
}

export function getKeyStatus(): Record<string, boolean> {
  return Object.fromEntries(providers.map((p) => [p.name, p.hasApiKey()]))
}

export function getKeys(): Record<string, string | null> {
  return Object.fromEntries(providers.map((p) => [p.name, p.getKeyMasked()]))
}

export function setProviderKey(providerName: string, key: string): boolean {
  const provider = providers.find((p) => p.name === providerName)
  if (!provider) return false
  provider.setKey(key)
  return true
}
