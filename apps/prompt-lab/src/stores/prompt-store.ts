import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { Variable } from '../types'
import { extractVariableKeys } from '../lib/template-engine'

interface PromptState {
  systemPrompt: string
  variables: Variable[]
  userMessage: string
  setSystemPrompt: (prompt: string) => void
  setUserMessage: (msg: string) => void
  addVariable: (key?: string) => void
  updateVariable: (index: number, field: 'key' | 'value', val: string) => void
  removeVariable: (index: number) => void
  syncVariablesFromTemplate: () => void
}

export const usePromptStore = create(
  immer<PromptState>((set, get) => ({
    systemPrompt: 'You are a helpful assistant.',
    variables: [],
    userMessage: 'Hello! Can you help me with something?',

    setSystemPrompt: (prompt) =>
      set((draft) => {
        draft.systemPrompt = prompt
      }),

    setUserMessage: (msg) =>
      set((draft) => {
        draft.userMessage = msg
      }),

    addVariable: (key = '') =>
      set((draft) => {
        draft.variables.push({ key, value: '' })
      }),

    updateVariable: (index, field, val) =>
      set((draft) => {
        draft.variables[index][field] = val
      }),

    removeVariable: (index) =>
      set((draft) => {
        draft.variables.splice(index, 1)
      }),

    syncVariablesFromTemplate: () => {
      const { systemPrompt, variables } = get()
      const keys = extractVariableKeys(systemPrompt)
      const existing = new Map(variables.map((v) => [v.key, v.value]))
      set((draft) => {
        draft.variables = keys.map((k) => ({ key: k, value: existing.get(k) ?? '' }))
      })
    },
  })),
)
