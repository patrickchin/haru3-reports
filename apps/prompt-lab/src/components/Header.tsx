import { usePromptStore } from '../stores/prompt-store'
import { useCompletionStore } from '../stores/completion-store'
import { useEffect, useCallback } from 'react'

export function Header() {
  const isRunning = useCompletionStore((s) => s.isRunning)
  const selectedModelIds = useCompletionStore((s) => s.selectedModelIds)
  const run = useCompletionStore((s) => s.run)
  const stop = useCompletionStore((s) => s.stop)
  const syncVariables = usePromptStore((s) => s.syncVariablesFromTemplate)

  const handleRun = useCallback(() => {
    syncVariables()
    run()
  }, [syncVariables, run])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault()
        if (isRunning) stop()
        else handleRun()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isRunning, handleRun, stop])

  return (
    <header className="flex items-center justify-between px-4 h-12 border-b border-zinc-800 bg-zinc-950 shrink-0">
      <div className="flex items-center gap-2">
        <span className="text-indigo-400 text-lg">⚗</span>
        <span className="font-semibold text-zinc-100 tracking-tight">Prompt Lab</span>
        <span className="text-zinc-600 text-xs ml-1">system prompt designer</span>
      </div>

      <div className="flex items-center gap-3">
        <span className="text-zinc-500 text-xs hidden sm:block">
          {selectedModelIds.length} model{selectedModelIds.length !== 1 ? 's' : ''} selected
        </span>

        <kbd className="hidden sm:inline text-zinc-600 text-xs border border-zinc-700 rounded px-1.5 py-0.5">
          ⌘↵
        </kbd>

        {isRunning ? (
          <button
            onClick={stop}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors"
          >
            <span className="animate-pulse">●</span> Stop
          </button>
        ) : (
          <button
            onClick={handleRun}
            disabled={selectedModelIds.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            ▶ Run
          </button>
        )}
      </div>
    </header>
  )
}
