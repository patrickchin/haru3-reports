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
