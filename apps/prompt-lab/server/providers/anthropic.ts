import Anthropic from '@anthropic-ai/sdk'
import type { LLMProvider, ProviderRequest, StreamChunk } from './types'

const SUPPORTED = ['claude-opus-4-5', 'claude-sonnet-4-5', 'claude-haiku-3-5']

export class AnthropicProvider implements LLMProvider {
  readonly supportedModels = SUPPORTED

  private client(): Anthropic {
    const apiKey = process.env.ANTHROPIC_API_KEY
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
