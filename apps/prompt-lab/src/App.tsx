import { Header } from './components/Header'
import { PromptEditor } from './components/PromptEditor'
import { VariablePanel } from './components/VariablePanel'
import { UserMessageInput } from './components/UserMessageInput'
import { ModelSelector } from './components/ModelSelector'
import { OutputGrid } from './components/OutputGrid'

export default function App() {
  return (
    <div className="flex flex-col h-full bg-zinc-950">
      <Header />

      <div className="flex flex-1 overflow-hidden">
        {/* Left panel — prompt & config */}
        <aside className="w-96 shrink-0 flex flex-col gap-5 overflow-y-auto px-4 py-4 border-r border-zinc-800 bg-zinc-950">
          <PromptEditor />
          <div className="border-t border-zinc-800" />
          <VariablePanel />
          <div className="border-t border-zinc-800" />
          <UserMessageInput />
          <div className="border-t border-zinc-800" />
          <ModelSelector />
        </aside>

        {/* Right panel — outputs */}
        <main className="flex-1 overflow-auto p-4">
          <OutputGrid />
        </main>
      </div>
    </div>
  )
}
