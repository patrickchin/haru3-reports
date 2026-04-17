import Anthropic from '@anthropic-ai/sdk'
import type { LLMProvider, ProviderRequest, StreamChunk } from './types'

const SUPPORTED = ['claude-opus-4-5', 'claude-sonnet-4-5', 'claude-haiku-3-5']

function isRealKey(val: string | undefined): boolean {
  if (!val) return false
  const trimmed = val.trim()
  return trimmed.length > 12 && !trimmed.endsWith('...')
}

export class AnthropicProvider implements LLMProvider {
  readonly name = 'anthropic'
  readonly envVar = 'ANTHROPIC_API_KEY'
  readonly supportedModels = SUPPORTED

  hasApiKey(): boolean {
    return isRealKey(process.env[this.envVar])
  }

  getKeyMasked(): string | null {
    const key = process.env[this.envVar]
    if (!key || !isRealKey(key)) return null
    if (key.length <= 8) return '••••••••'
    return key.slice(0, 4) + '••••' + key.slice(-4)
  }

  setKey(key: string): void {
    process.env[this.envVar] = key
  }

  private client(): Anthropic {
    const apiKey = process.env[this.envVar]
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set')
    return new Anthropic({ apiKey })
  }

  async *stream(req: ProviderRequest): AsyncIterable<StreamChunk> {
    const client = this.client()

    const stream = client.messages.stream({
      model: req.model,
      max_tokens: req.maxTokens,
      temperature: req.temperature,
      system: req.systemPrompt,
      messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
    })

    for await (const event of stream) {
      if (
        event.type === 'content_block_delta' &&
        event.delta.type === 'text_delta'
      ) {
        yield { type: 'delta', delta: event.delta.text }
      }

      if (event.type === 'message_delta' && event.usage) {
        // output token count from message_delta
        yield {
          type: 'usage',
          outputTokens: event.usage.output_tokens,
        }
      }

      if (event.type === 'message_start' && event.message.usage) {
        yield {
          type: 'usage',
          inputTokens: event.message.usage.input_tokens,
        }
      }
    }
  }
}
