import type { CompletionRequest, SSEEvent } from '../types'

export interface SSECallbacks {
  onStart: (model: string) => void
  onToken: (model: string, delta: string) => void
  onDone: (model: string, inputTokens: number, outputTokens: number, latencyMs: number) => void
  onError: (model: string, error: string) => void
}

export async function streamCompletions(
  request: CompletionRequest,
  signal: AbortSignal,
  callbacks: SSECallbacks,
): Promise<void> {
  const response = await fetch('/api/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    signal,
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`API error ${response.status}: ${text}`)
  }

  if (!response.body) {
    throw new Error('No response body for streaming')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const raw = line.slice(6).trim()
        if (!raw || raw === '[DONE]') continue

        let event: SSEEvent
        try {
          event = JSON.parse(raw) as SSEEvent
        } catch {
          continue
        }

        switch (event.type) {
          case 'start':
            callbacks.onStart(event.model)
            break
          case 'token':
            callbacks.onToken(event.model, event.delta)
            break
          case 'done':
            callbacks.onDone(event.model, event.inputTokens, event.outputTokens, event.latencyMs)
            break
          case 'error':
            callbacks.onError(event.model, event.error)
            break
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}
