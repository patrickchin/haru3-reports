import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { findProvider, listModels, getKeyStatus, getKeys, setProviderKey } from '../providers/registry'

const MessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string(),
})

const CompletionSchema = z.object({
  systemPrompt: z.string().max(100_000),
  messages: z.array(MessageSchema).min(1).max(50),
  modelIds: z.array(z.string()).min(1).max(10),
  temperature: z.number().min(0).max(2).default(0.7),
  maxTokens: z.number().min(1).max(32_768).default(2048),
})

export const completionsRouter = new Hono()

completionsRouter.get('/models', (c) => {
  return c.json({ models: listModels() })
})

completionsRouter.get('/key-status', (c) => {
  return c.json(getKeyStatus())
})

completionsRouter.get('/keys', (c) => {
  return c.json(getKeys())
})

const SetKeySchema = z.object({
  provider: z.string(),
  key: z.string().min(1),
})

completionsRouter.put(
  '/keys',
  zValidator('json', SetKeySchema),
  (c) => {
    const { provider, key } = c.req.valid('json')
    const ok = setProviderKey(provider, key)
    if (!ok) return c.json({ error: `Unknown provider: ${provider}` }, 400)
    return c.json({ ok: true, status: getKeyStatus(), keys: getKeys() })
  },
)

completionsRouter.post(
  '/',
  zValidator('json', CompletionSchema),
  async (c) => {
    const body = c.req.valid('json')

    // Validate all models have a provider before starting the stream
    for (const modelId of body.modelIds) {
      if (!findProvider(modelId)) {
        return c.json({ error: `Unsupported model: ${modelId}` }, 400)
      }
    }

    const encoder = new TextEncoder()

    function sseEvent(data: unknown): Uint8Array {
      return encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
    }

    const readable = new ReadableStream({
      async start(controller) {
        // Fan out — run all models in parallel
        const tasks = body.modelIds.map(async (modelId) => {
          const provider = findProvider(modelId)!
          const startMs = Date.now()
          let inputTokens = 0
          let outputTokens = 0

          controller.enqueue(sseEvent({ type: 'start', model: modelId }))

          try {
            for await (const chunk of provider.stream({
              model: modelId,
              systemPrompt: body.systemPrompt,
              messages: body.messages,
              temperature: body.temperature,
              maxTokens: body.maxTokens,
            })) {
              if (chunk.type === 'delta' && chunk.delta) {
                controller.enqueue(sseEvent({ type: 'token', model: modelId, delta: chunk.delta }))
              } else if (chunk.type === 'usage') {
                if (chunk.inputTokens !== undefined) inputTokens = chunk.inputTokens
                if (chunk.outputTokens !== undefined) outputTokens += chunk.outputTokens
              }
            }

            controller.enqueue(
              sseEvent({
                type: 'done',
                model: modelId,
                inputTokens,
                outputTokens,
                latencyMs: Date.now() - startMs,
              }),
            )
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'Unknown error'
            controller.enqueue(sseEvent({ type: 'error', model: modelId, error: msg }))
          }
        })

        await Promise.allSettled(tasks)
        controller.close()
      },
    })

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    })
  },
)
