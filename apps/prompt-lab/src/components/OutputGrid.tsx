import { useCompletionStore } from '../stores/completion-store'
import { findModel } from '../lib/models'
import { formatCost, formatLatency, formatTokens } from '../lib/cost'
import type { ModelOutput } from '../types'

function StatusBadge({ status }: { status: ModelOutput['status'] }) {
  if (status === 'idle') return null
  if (status === 'starting') return (
    <span className="text-zinc-500 text-xs animate-pulse">connecting…</span>
  )
  if (status === 'streaming') return (
    <span className="flex items-center gap-1 text-indigo-400 text-xs">
      <span className="animate-pulse">●</span> streaming
    </span>
  )
  if (status === 'error') return (
    <span className="text-red-400 text-xs">error</span>
  )
  return null
}

function OutputCard({ output }: { output: ModelOutput }) {
  const model = findModel(output.modelId)
  const isDone = output.status === 'done'
  const isError = output.status === 'error'
  const isEmpty = output.status === 'idle'

  return (
    <div className={[
      'flex flex-col rounded-lg border bg-zinc-900 overflow-hidden',
      isError ? 'border-red-500/30' : 'border-zinc-800',
    ].join(' ')}>
      {/* Card header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800 bg-zinc-950">
        <div className="flex items-center gap-2">
          <span className={[
            'text-xs font-medium',
            output.status === 'streaming' ? 'text-indigo-300' : 'text-zinc-200',
          ].join(' ')}>
            {model?.displayName ?? output.modelId}
          </span>
          <span className="text-zinc-700 text-xs">{model?.provider}</span>
        </div>
        <StatusBadge status={output.status} />
      </div>

      {/* Output content */}
      <div className="flex-1 px-3 py-2.5 min-h-24 max-h-96 overflow-y-auto">
        {isEmpty ? (
          <span className="text-zinc-700 text-xs italic">Waiting to run…</span>
        ) : isError ? (
          <span className="text-red-400 text-xs">{output.error ?? 'Unknown error'}</span>
        ) : (
          <pre className="text-zinc-200 text-sm whitespace-pre-wrap break-words font-sans leading-relaxed">
            {output.content}
            {output.status === 'streaming' && (
              <span className="inline-block w-0.5 h-4 bg-indigo-400 animate-pulse ml-0.5 align-text-bottom" />
            )}
          </pre>
        )}
      </div>

      {/* Stats footer */}
      {isDone && (
        <div className="flex items-center gap-3 px-3 py-1.5 border-t border-zinc-800 bg-zinc-950">
          <span className="text-zinc-600 text-xs">{formatLatency(output.latencyMs)}</span>
          <span className="text-zinc-600 text-xs">
            {formatTokens(output.inputTokens)}↑ {formatTokens(output.outputTokens)}↓
          </span>
          <span className="text-zinc-500 text-xs ml-auto">{formatCost(output.costUsd)}</span>
        </div>
      )}
    </div>
  )
}

export function OutputGrid() {
  const outputs = useCompletionStore((s) => s.outputs)
  const selectedModelIds = useCompletionStore((s) => s.selectedModelIds)

  if (selectedModelIds.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-zinc-600 text-sm text-center">
          Select at least one model from the left panel, then click Run.
        </p>
      </div>
    )
  }

  const outputList = selectedModelIds.map(
    (id) => outputs[id] ?? { modelId: id, status: 'idle' as const, content: '', inputTokens: 0, outputTokens: 0, latencyMs: 0, costUsd: 0 }
  )

  const cols = outputList.length === 1 ? 'grid-cols-1' : outputList.length === 2 ? 'grid-cols-2' : 'grid-cols-3'

  return (
    <div className={`grid ${cols} gap-4 h-full overflow-auto`}>
      {outputList.map((out) => (
        <OutputCard key={out.modelId} output={out} />
      ))}
    </div>
  )
}
