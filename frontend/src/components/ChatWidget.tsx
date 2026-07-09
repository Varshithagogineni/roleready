import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { sendChat, type ChatMessage, type ChatSource } from "@/lib/api"
import { ExternalLink, Globe, MessageCircle, Send, Sparkles, X } from "lucide-react"

interface Props {
  company: string
  role: string
  context: string
}

interface Msg extends ChatMessage {
  sources?: ChatSource[]
  answeredBy?: "coach" | "web"
}

/** Ray — a floating, grounded chat assistant available after a prep run. */
export function ChatWidget({ company, role, context }: Props) {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState("")
  const [busy, setBusy] = useState(false)
  const [msgs, setMsgs] = useState<Msg[]>([
    {
      role: "assistant",
      content: `Hi! I'm Ray 👋 Ask me anything about ${company} or this ${role} role — visa history, culture, how to stand out, interview prep, whatever helps.`,
    },
  ])
  const [slow, setSlow] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
  }, [msgs, busy, open])

  // After 8s of waiting, reassure the user instead of leaving silent dots.
  useEffect(() => {
    if (!busy) {
      setSlow(false)
      return
    }
    const t = setTimeout(() => setSlow(true), 8000)
    return () => clearTimeout(t)
  }, [busy])

  async function send(text: string) {
    const q = text.trim()
    if (!q || busy) return
    const next: Msg[] = [...msgs, { role: "user", content: q }]
    setMsgs(next)
    setInput("")
    setBusy(true)
    try {
      const reply = await sendChat(
        company,
        role,
        context,
        next.map(({ role, content }) => ({ role, content }))
      )
      setMsgs((m) => [
        ...m,
        { role: "assistant", content: reply.answer, sources: reply.sources, answeredBy: reply.answered_by },
      ])
    } catch (e) {
      setMsgs((m) => [
        ...m,
        {
          role: "assistant",
          content:
            e instanceof Error && /rate limit|429/i.test(e.message)
              ? "I hit the free-tier rate limit — give it ~30 seconds and ask again (or add your own key in API keys)."
              : "Sorry, I couldn't answer that just now. Try rephrasing?",
        },
      ])
    } finally {
      setBusy(false)
    }
  }

  const suggestions = [
    "How do I stand out here?",
    "What's their visa sponsorship track record?",
    "What's the interview process like?",
  ]

  return (
    <>
      {/* Floating launcher */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="btn-hero fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-full px-4 py-3 shadow-lg"
        >
          <MessageCircle className="size-5" />
          <span className="font-medium">Ask Ray</span>
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div className="anim-panel-in fixed bottom-5 right-5 z-50 flex h-[min(600px,80vh)] w-[min(400px,92vw)] flex-col overflow-hidden rounded-2xl border bg-card shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between bg-gradient-to-r from-indigo-500 to-violet-600 px-4 py-3 text-white">
            <div className="flex items-center gap-2">
              <div className="flex size-8 items-center justify-center rounded-full bg-white/20">
                <Sparkles className="size-4" />
              </div>
              <div className="leading-tight">
                <p className="font-semibold">Ray</p>
                <p className="text-xs text-white/80">Your prep assistant · {company}</p>
              </div>
            </div>
            <button onClick={() => setOpen(false)} className="rounded-md p-1 hover:bg-white/20">
              <X className="size-5" />
            </button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
            {msgs.map((m, i) => (
              <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm ${
                    m.role === "user"
                      ? "rounded-br-sm bg-primary text-primary-foreground"
                      : "rounded-bl-sm bg-muted text-foreground"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{m.content}</p>
                  {m.answeredBy === "web" && (
                    <div className="mt-1.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Globe className="size-3" /> via web search
                    </div>
                  )}
                  {m.sources && m.sources.length > 0 && (
                    <div className="mt-2 space-y-1 border-t border-border/60 pt-2">
                      {m.sources.slice(0, 3).map((s) => (
                        <a
                          key={s.url}
                          href={s.url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          <ExternalLink className="size-3 shrink-0" />
                          <span className="truncate">{s.title}</span>
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {busy && (
              <div className="flex flex-col items-start gap-1">
                <div className="flex items-center gap-1 rounded-2xl rounded-bl-sm bg-muted px-4 py-3">
                  <span className="typing-dot size-2 rounded-full bg-muted-foreground" />
                  <span className="typing-dot size-2 rounded-full bg-muted-foreground" />
                  <span className="typing-dot size-2 rounded-full bg-muted-foreground" />
                </div>
                {slow && (
                  <span className="px-1 text-xs text-muted-foreground">
                    Ray's thinking — this one's taking a moment.
                  </span>
                )}
              </div>
            )}

            {/* Starter suggestions (only before the first question) */}
            {msgs.length === 1 && !busy && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    onClick={() => void send(s)}
                    className="rounded-full border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Composer */}
          <div className="flex items-center gap-2 border-t p-3">
            <Input
              placeholder="Ask Ray anything..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  void send(input)
                }
              }}
            />
            <Button
              size="icon"
              className="btn-hero shrink-0"
              disabled={!input.trim() || busy}
              onClick={() => void send(input)}
            >
              <Send className="size-4" />
            </Button>
          </div>
        </div>
      )}
    </>
  )
}
