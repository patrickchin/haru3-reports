import { useCompletionStore } from '../stores/completion-store'
import { MODEL_REGISTRY } from '../lib/models'

const PROVIDERS = [
  { id: 'openai', label: 'OpenAI', color: 'emerald' },
  { id: 'anthropic', label: 'Anthropic', color: 'orange' },
  { id: 'moonshot', label: 'Moonshot (Kimi)', color: 'blue' },
] as const

export function ModelSelector() {
  const selectedModelIds = useCompletionStore((s) => s.selectedModelIds)
  const temperature = useCompletionStore((s) => s.temperature)
  const maxTokens = useCompletionStore((s) => s.maxTokens)
  const toggleModel = useCompletionStore((s) => s.toggleModel)
  const setTemperature = useCompletionStore((s) => s.setTemperature)
  const setMaxTokens = useCompletionStore((s) => s.setMaxTokens)

  return (
    <section className="flex flex-col gap-3">
      <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
        Models
      </label>

      {PROVIDERS.map((provider) => {
        const models = MODEL_REGISTRY.filter((m) => m.provider === provider.id)
        return (
          <div key={provider.id} className="flex flex-col gap-1.5">
            <span className="text-xs text-zinc-500">{provider.label}</span>
            <div className="flex flex-wrap gap-1.5">
              {models.map((model) => {
                const selected = selectedModelIds.includes(model.id)
                return (
                  <button
                    key={model.id}
                    onClick={() => toggleModel(model.id)}
                    className={[
                      'px-2.5 py-1 rounded text-xs border transition-all',
                      selected
                        ? 'bg-indigo-600/20 border-indigo-500/60 text-indigo-300'
                        : 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-300',
                    ].join(' ')}
                  >
                    {model.displayName}
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}

      <div className="flex gap-4 pt-1">
        <div className="flex flex-col gap-1 flex-1">
          <div className="flex justify-between items-center">
            <label className="text-xs text-zinc-500">Temperature</label>
            <span className="text-xs font-mono text-zinc-400">{temperature.toFixed(1)}</span>
          </div>
          <input
            type="range"
            min="0"
            max="2"
            step="0.1"
            value={temperature}
            onChange={(e) => setTemperature(Number(e.target.value))}
            className="w-full accent-indigo-500"
          />
        </div>

        <div className="flex flex-col gap-1 w-28">
          <label className="text-xs text-zinc-500">Max tokens</label>
          <input
            type="number"
            min="64"
            max="32768"
            step="64"
            value={maxTokens}
            onChange={(e) => setMaxTokens(Number(e.target.value))}
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs font-mono text-zinc-300 focus:outline-none focus:border-indigo-500 transition-colors"
          />
        </div>
      </div>
    </section>
  )
}
