import { usePromptStore } from '../stores/prompt-store'

export function UserMessageInput() {
  const userMessage = usePromptStore((s) => s.userMessage)
  const setUserMessage = usePromptStore((s) => s.setUserMessage)

  return (
    <section className="flex flex-col gap-2">
      <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
        User Message
      </label>
      <textarea
        value={userMessage}
        onChange={(e) => setUserMessage(e.target.value)}
        placeholder="Type the user message to test..."
        className="w-full h-24 resize-none rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-zinc-100 text-sm placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 transition-colors"
        style={{ lineHeight: 1.6 }}
      />
    </section>
  )
}
