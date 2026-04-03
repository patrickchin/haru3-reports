import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { ModelOutput } from '../types'
import { streamCompletions } from '../lib/sse-client'
import { interpolateTemplate } from '../lib/template-engine'
import { usePromptStore } from './prompt-store'
import { calcCostUsd } from '../lib/cost'
import { MODEL_REGISTRY } from '../lib/models'

interface CompletionState {
  selectedModelIds: string[]
  temperature: number
  maxTokens: number
  outputs: Record<string, ModelOutput>
  isRunning: boolean
  abortController: AbortController | null

  toggleModel: (modelId: string) => void
  setTemperature: (t: number) => void
  setMaxTokens: (n: number) => void
  run: () => Promise<void>
  stop: () => void
}

function makeIdleOutput(modelId: string): ModelOutput {
  return {
    modelId,
    status: 'idle',
    content: '',
    inputTokens: 0,
    outputTokens: 0,
    latencyMs: 0,
    costUsd: 0,
  }
}

export const useCompletionStore = create(
  immer<CompletionState>((set, get) => ({
    selectedModelIds: ['gpt-4o', 'claude-sonnet-4-5'],
    temperature: 0.7,
    maxTokens: 2048,
    outputs: {},
    isRunning: false,
    abortController: null,

    toggleModel: (modelId) =>
      set((draft) => {
        const idx = draft.selectedModelIds.indexOf(modelId)
        if (idx >= 0) {
          draft.selectedModelIds.splice(idx, 1)
        } else {
          draft.selectedModelIds.push(modelId)
        }
      }),

    setTemperature: (t) =>
      set((draft) => {
        draft.temperature = t
      }),

    setMaxTokens: (n) =>
      set((draft) => {
        draft.maxTokens = n
      }),

    run: async () => {
      const { selectedModelIds, temperature, maxTokens } = get()
      if (selectedModelIds.length === 0 || get().isRunning) return

      const { systemPrompt, variables, userMessage } = usePromptStore.getState()
      const interpolatedSystem = interpolateTemplate(systemPrompt, variables)

      const abortController = new AbortController()

      set((draft) => {
        draft.isRunning = true
        draft.abortController = abortController as unknown as AbortController
        draft.outputs = Object.fromEntries(
          selectedModelIds.map((id) => [id, makeIdleOutput(id)]),
        )
      })

      try {
        await streamCompletions(
          {
            systemPrompt: interpolatedSystem,
            messages: [{ role: 'user', content: userMessage }],
            modelIds: selectedModelIds,
            temperature,
            maxTokens,
          },
          abortController.signal,
          {
            onStart: (model) =>
              set((draft) => {
                if (draft.outputs[model]) draft.outputs[model].status = 'streaming'
              }),

            onToken: (model, delta) =>
              set((draft) => {
                if (draft.outputs[model]) {
                  draft.outputs[model].content += delta
                }
              }),

            onDone: (model, inputTokens, outputTokens, latencyMs) =>
              set((draft) => {
                const out = draft.outputs[model]
                if (!out) return
                out.status = 'done'
                out.inputTokens = inputTokens
                out.outputTokens = outputTokens
                out.latencyMs = latencyMs
                const cfg = MODEL_REGISTRY.find((m) => m.id === model)
                out.costUsd = cfg ? calcCostUsd(cfg, inputTokens, outputTokens) : 0
              }),

            onError: (model, error) =>
              set((draft) => {
                if (draft.outputs[model]) {
                  draft.outputs[model].status = 'error'
                  draft.outputs[model].error = error
                }
              }),
          },
        )
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          console.error('Completion stream error:', err)
        }
      } finally {
        set((draft) => {
          draft.isRunning = false
          draft.abortController = null
        })
      }
    },

    stop: () => {
      const { abortController } = get()
      abortController?.abort()
      set((draft) => {
        draft.isRunning = false
        draft.abortController = null
        for (const out of Object.values(draft.outputs)) {
          if (out.status === 'streaming' || out.status === 'starting') {
            out.status = 'done'
          }
        }
      })
    },
  })),
)
