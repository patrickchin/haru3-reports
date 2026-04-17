import type { Message } from '../../src/types'

export interface StreamChunk {
  type: 'delta' | 'usage' | 'error'
  delta?: string
  inputTokens?: number
  outputTokens?: number
  error?: string
}

export interface ProviderRequest {
  model: string
  systemPrompt: string
  messages: Message[]
  temperature: number
  maxTokens: number
}

export interface LLMProvider {
  readonly name: string
  readonly envVar: string
  supportedModels: string[]
  hasApiKey(): boolean
  getKeyMasked(): string | null
  setKey(key: string): void
  stream(request: ProviderRequest): AsyncIterable<StreamChunk>
}
