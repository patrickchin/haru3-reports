import OpenAI from 'openai'
import type { LLMProvider, ProviderRequest, StreamChunk } from './types'

const SUPPORTED = ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'o4-mini']

export class OpenAIProvider implements LLMProvider {
  readonly supportedModels = SUPPORTED

  private client(): OpenAI {
    const apiKey = process.env.OPENAI_API_KEY
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
