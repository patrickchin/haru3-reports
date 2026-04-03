import { usePromptStore } from '../stores/prompt-store'

export function VariablePanel() {
  const variables = usePromptStore((s) => s.variables)
  const addVariable = usePromptStore((s) => s.addVariable)
  const updateVariable = usePromptStore((s) => s.updateVariable)
  const removeVariable = usePromptStore((s) => s.removeVariable)
  const syncVariables = usePromptStore((s) => s.syncVariablesFromTemplate)

  if (variables.length === 0) {
    return (
      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
            Variables
          </label>
          <div className="flex gap-2">
            <button
              onClick={syncVariables}
              className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              Sync from template
            </button>
            <button
              onClick={() => addVariable()}
              className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              + Add
            </button>
          </div>
        </div>
        <p className="text-xs text-zinc-600 italic">
          No variables. Use {'{{key}}'} in the prompt or click "Sync from template".
        </p>
      </section>
    )
  }

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
          Variables
        </label>
        <div className="flex gap-3">
          <button
            onClick={syncVariables}
            className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            Sync
          </button>
          <button
            onClick={() => addVariable()}
            className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
          >
            + Add
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        {variables.map((v, i) => (
          <div key={i} className="flex gap-2 items-center">
            <input
              value={v.key}
              onChange={(e) => updateVariable(i, 'key', e.target.value)}
              placeholder="key"
              className="w-28 shrink-0 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs font-mono text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500 transition-colors"
            />
            <input
              value={v.value}
              onChange={(e) => updateVariable(i, 'value', e.target.value)}
              placeholder="value"
              className="flex-1 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500 transition-colors"
            />
            <button
              onClick={() => removeVariable(i)}
              className="text-zinc-600 hover:text-red-400 transition-colors text-sm leading-none"
              aria-label="Remove variable"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </section>
  )
}
