export type Provider = 'openai' | 'anthropic' | 'moonshot'

export interface ModelConfig {
  id: string
  provider: Provider
  displayName: string
  contextWindow: number
  maxOutputTokens: number
  inputPricePer1M: number
  outputPricePer1M: number
}

export interface Variable {
  key: string
  value: string
}

export interface Message {
  role: 'user' | 'assistant'
  content: string
}

export interface CompletionRequest {
  systemPrompt: string
  messages: Message[]
  modelIds: string[]
  temperature: number
  maxTokens: number
}

export type SSEEventType = 'start' | 'token' | 'done' | 'error'

export interface SSEStartEvent {
  type: 'start'
  model: string
}

export interface SSETokenEvent {
  type: 'token'
  model: string
  delta: string
}

export interface SSEDoneEvent {
  type: 'done'
  model: string
  inputTokens: number
  outputTokens: number
  latencyMs: number
}

export interface SSEErrorEvent {
  type: 'error'
  model: string
  error: string
}

export type SSEEvent = SSEStartEvent | SSETokenEvent | SSEDoneEvent | SSEErrorEvent

export type OutputStatus = 'idle' | 'starting' | 'streaming' | 'done' | 'error'

export interface ModelOutput {
  modelId: string
  status: OutputStatus
  content: string
  inputTokens: number
  outputTokens: number
  latencyMs: number
  costUsd: number
  error?: string
}
