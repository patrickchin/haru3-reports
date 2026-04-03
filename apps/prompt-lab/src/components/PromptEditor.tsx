import { usePromptStore } from '../stores/prompt-store'

export function PromptEditor() {
  const systemPrompt = usePromptStore((s) => s.systemPrompt)
  const setSystemPrompt = usePromptStore((s) => s.setSystemPrompt)
  const charCount = systemPrompt.length

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
          System Prompt
        </label>
        <span className="text-xs text-zinc-600">{charCount.toLocaleString()} chars</span>
      </div>
      <textarea
        value={systemPrompt}
        onChange={(e) => setSystemPrompt(e.target.value)}
        spellCheck={false}
        placeholder="You are a helpful assistant..."
        className="w-full h-48 resize-none rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-zinc-100 text-sm font-mono placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 transition-colors"
        style={{ lineHeight: 1.6 }}
      />
      <p className="text-xs text-zinc-600">
        Use{' '}
        <code className="text-zinc-400 bg-zinc-800 px-1 py-0.5 rounded text-[11px]">
          {'{{variable}}'}
        </code>{' '}
        for template substitution
      </p>
    </section>
  )
}
