import OpenAI from 'openai'
import type { LLMProvider, ProviderRequest, StreamChunk } from './types'

const SUPPORTED = ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'o4-mini']

function isRealKey(val: string | undefined): boolean {
  if (!val) return false
  const trimmed = val.trim()
  return trimmed.length > 12 && !trimmed.endsWith('...')
}

export class OpenAIProvider implements LLMProvider {
  readonly name = 'openai'
  readonly envVar = 'OPENAI_API_KEY'
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

  private client(): OpenAI {
    const apiKey = process.env[this.envVar]
    if (!apiKey) throw new Error('OPENAI_API_KEY is not set')
    return new OpenAI({ apiKey })
  }

  async *stream(req: ProviderRequest): AsyncIterable<StreamChunk> {
    const client = this.client()

    const stream = await client.chat.completions.create({
      model: req.model,
      temperature: req.temperature,
      max_tokens: req.maxTokens,
      messages: [
        { role: 'system', content: req.systemPrompt },
        ...req.messages.map((m) => ({ role: m.role, content: m.content })),
      ],
      stream: true,
      stream_options: { include_usage: true },
    })

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content
      if (delta) {
        yield { type: 'delta', delta }
      }

      if (chunk.usage) {
        yield {
          type: 'usage',
          inputTokens: chunk.usage.prompt_tokens,
          outputTokens: chunk.usage.completion_tokens,
        }
      }
    }
  }
}
