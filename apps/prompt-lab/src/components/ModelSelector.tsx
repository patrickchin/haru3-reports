import { useEffect, useState, useCallback } from 'react'
import { useCompletionStore } from '../stores/completion-store'
import { MODEL_REGISTRY } from '../lib/models'

const API_BASE = 'http://localhost:3002/api/completions'

const PROVIDERS = [
  { id: 'openai', label: 'OpenAI', color: 'emerald' },
  { id: 'anthropic', label: 'Anthropic', color: 'orange' },
  { id: 'moonshot', label: 'Moonshot (Kimi)', color: 'blue' },
] as const

function KeyEditor({ providerId, maskedKey, hasKey, onSaved }: {
  providerId: string
  maskedKey: string | null
  hasKey: boolean
  onSaved: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!value.trim()) return
    setSaving(true)
    try {
      const res = await fetch(`${API_BASE}/keys`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: providerId, key: value.trim() }),
      })
      if (res.ok) {
        setValue('')
        setEditing(false)
        onSaved()
      }
    } finally {
      setSaving(false)
    }
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1.5 mt-1">
        <input
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false) }}
          placeholder="Paste API key…"
          autoFocus
          className="flex-1 rounded border border-zinc-600 bg-zinc-900 px-2 py-0.5 text-[11px] font-mono text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500 transition-colors"
        />
        <button
          onClick={save}
          disabled={saving || !value.trim()}
          className="text-[10px] text-emerald-400 hover:text-emerald-300 disabled:text-zinc-600 transition-colors"
        >
          {saving ? '…' : 'Save'}
        </button>
        <button
          onClick={() => { setEditing(false); setValue('') }}
          className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          Cancel
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 mt-0.5">
      {hasKey && maskedKey && (
        <span className="text-[10px] font-mono text-zinc-500">{maskedKey}</span>
      )}
      <button
        onClick={() => setEditing(true)}
        className="text-[10px] text-indigo-400 hover:text-indigo-300 transition-colors"
      >
        {hasKey ? 'Change' : 'Set key'}
      </button>
    </div>
  )
}

export function ModelSelector() {
  const selectedModelIds = useCompletionStore((s) => s.selectedModelIds)
  const temperature = useCompletionStore((s) => s.temperature)
  const maxTokens = useCompletionStore((s) => s.maxTokens)
  const toggleModel = useCompletionStore((s) => s.toggleModel)
  const setTemperature = useCompletionStore((s) => s.setTemperature)
  const setMaxTokens = useCompletionStore((s) => s.setMaxTokens)

  const [keyStatus, setKeyStatus] = useState<Record<string, boolean>>({})
  const [maskedKeys, setMaskedKeys] = useState<Record<string, string | null>>({})

  const refreshKeys = useCallback(() => {
    Promise.all([
      fetch(`${API_BASE}/key-status`).then((r) => r.json()),
      fetch(`${API_BASE}/keys`).then((r) => r.json()),
    ])
      .then(([status, keys]) => {
        setKeyStatus(status)
        setMaskedKeys(keys)
      })
      .catch(() => {})
  }, [])

  useEffect(() => { refreshKeys() }, [refreshKeys])

  return (
    <section className="flex flex-col gap-3">
      <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
        Models
      </label>

      {PROVIDERS.map((provider) => {
        const models = MODEL_REGISTRY.filter((m) => m.provider === provider.id)
        const hasKey = keyStatus[provider.id]
        const keyLoaded = provider.id in keyStatus
        return (
          <div key={provider.id} className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-500">{provider.label}</span>
              {keyLoaded && (
                hasKey ? (
                  <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    Key set
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] text-red-400">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-400" />
                    No key
                  </span>
                )
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {models.map((model) => {
                const selected = selectedModelIds.includes(model.id)
                const disabled = keyLoaded && !hasKey
                return (
                  <button
                    key={model.id}
                    onClick={() => toggleModel(model.id)}
                    disabled={disabled}
                    className={[
                      'px-2.5 py-1 rounded text-xs border transition-all',
                      disabled
                        ? 'bg-zinc-900/50 border-zinc-800 text-zinc-600 cursor-not-allowed'
                        : selected
                          ? 'bg-indigo-600/20 border-indigo-500/60 text-indigo-300'
                          : 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-300',
                    ].join(' ')}
                  >
                    {model.displayName}
                  </button>
                )
              })}
            </div>
            <KeyEditor
              providerId={provider.id}
              maskedKey={maskedKeys[provider.id] ?? null}
              hasKey={!!hasKey}
              onSaved={refreshKeys}
            />
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
