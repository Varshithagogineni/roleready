import { useEffect, useState, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  connectCommand,
  createToken,
  listTokens,
  revokeToken,
  type McpToken,
} from "@/lib/mcpTokens"
import { Check, Copy, Loader2, Trash2 } from "lucide-react"

/** Claude's sunburst mark, inline so it costs no network request.
 *  Used to signal "works with Claude" — not an endorsement. */
function ClaudeMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      {Array.from({ length: 12 }).map((_, i) => (
        <rect
          key={i}
          x="11.15"
          y="2.1"
          width="1.7"
          height="8.1"
          rx="0.85"
          transform={`rotate(${i * 30} 12 12)`}
        />
      ))}
    </svg>
  )
}

function CopyButton({ value, tone = "ghost" }: { value: string; tone?: "ghost" | "solid" }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      aria-label="Copy to clipboard"
      onClick={async () => {
        await navigator.clipboard.writeText(value)
        setCopied(true)
        setTimeout(() => setCopied(false), 1600)
      }}
      className={`flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-all active:scale-95 ${
        tone === "solid"
          ? "bg-foreground text-background hover:opacity-90"
          : "border bg-background hover:bg-muted"
      }`}
    >
      {copied ? (
        <Check className="size-3.5 text-emerald-500" />
      ) : (
        <Copy className="size-3.5" />
      )}
      {copied ? "Copied" : "Copy"}
    </button>
  )
}

/** "2h ago" style, falling back to a date once it's old enough to not matter. */
function relTime(iso: string | null): string {
  if (!iso) return "not used yet"
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`
  if (mins < 10080) return `${Math.round(mins / 1440)}d ago`
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

/** "Use RoleReady in Claude" — generate a connection code, review and revoke
 *  existing ones. The code is shown exactly once, right after it's created. */
export function ConnectClaudeSection({ userId }: { userId: string | undefined }) {
  const [tokens, setTokens] = useState<McpToken[]>([])
  const [label, setLabel] = useState("")
  const [fresh, setFresh] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function refresh() {
    try {
      setTokens(await listTokens())
    } catch {
      /* listing is non-critical; generating still works */
    }
  }

  useEffect(() => {
    if (userId) void refresh()
  }, [userId])

  async function handleGenerate() {
    if (!userId) {
      setError("Sign in first so the code can be tied to your account.")
      return
    }
    setBusy(true)
    setError(null)
    try {
      setFresh(await createToken(userId, label))
      setLabel("")
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create a connection code.")
    } finally {
      setBusy(false)
    }
  }

  async function handleRevoke(id: string) {
    setError(null)
    try {
      await revokeToken(id)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not revoke that code.")
    }
  }

  const connected = tokens.length > 0

  return (
    <div className="relative overflow-hidden rounded-xl border bg-gradient-to-br from-[#D97757]/[0.07] via-transparent to-violet-500/[0.07] p-4">
      {/* soft glow behind the mark */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-10 -left-10 size-32 rounded-full bg-[#D97757]/10 blur-2xl"
      />

      <div className="relative flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#D97757]/12 ring-1 ring-[#D97757]/20">
          <ClaudeMark className="size-5 text-[#D97757]" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">Use RoleReady in Claude</h3>
            {connected && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                <span className="size-1.5 rounded-full bg-emerald-500" />
                Connected
              </span>
            )}
          </div>
          <p className="text-muted-foreground mt-0.5 text-sm">
            Research companies, score your resume and prep interviews without
            leaving the chat — running on the keys you saved above.
          </p>
        </div>
      </div>

      {fresh ? (
        <div className="relative mt-4 space-y-3">
          <Step n={1} title="Copy your connection code" warn="Shown only once">
            <div className="flex min-w-0 items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-md border bg-background px-2.5 py-2 font-mono text-xs">
                {fresh}
              </code>
              <CopyButton value={fresh} tone="solid" />
            </div>
          </Step>

          <Step n={2} title="Run this in your terminal">
            <div className="flex min-w-0 items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-md border bg-background px-2.5 py-2 font-mono text-xs">
                {connectCommand(fresh)}
              </code>
              <CopyButton value={connectCommand(fresh)} />
            </div>
          </Step>

          <Button
            size="sm"
            className="w-full"
            onClick={() => {
              setFresh(null)
              void refresh()
            }}
          >
            Done — I've saved my code
          </Button>
        </div>
      ) : (
        <div className="relative mt-4 flex items-center gap-2">
          <Input
            aria-label="Name this device (optional)"
            placeholder="Name this device — e.g. My laptop"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="h-9"
          />
          <Button onClick={handleGenerate} disabled={busy} className="h-9 shrink-0 gap-1.5">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <ClaudeMark className="size-4" />}
            Generate code
          </Button>
        </div>
      )}

      {tokens.length > 0 && (
        <ul className="relative mt-3 space-y-1.5">
          {tokens.map((t) => (
            <li
              key={t.id}
              className="group flex min-w-0 items-center gap-3 rounded-lg border bg-background/60 px-3 py-2 transition-colors hover:bg-background"
            >
              <span className="size-1.5 shrink-0 rounded-full bg-emerald-500" />
              <div className="min-w-0 flex-1">
                <div className="truncate font-mono text-xs">{t.token_prefix}…</div>
                <div className="text-muted-foreground truncate text-[11px]">
                  {t.label || "Unnamed device"} · {relTime(t.last_used_at)}
                </div>
              </div>
              <button
                type="button"
                aria-label={`Revoke code ${t.token_prefix}`}
                title="Revoke — this device stops working immediately"
                onClick={() => void handleRevoke(t.id)}
                className="text-muted-foreground shrink-0 rounded-md p-1.5 opacity-0 transition-all hover:bg-red-500/10 hover:text-red-500 focus-visible:opacity-100 group-hover:opacity-100"
              >
                <Trash2 className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="relative mt-2 text-sm text-red-500">{error}</p>}
    </div>
  )
}

function Step({
  n,
  title,
  warn,
  children,
}: {
  n: number
  title: string
  warn?: string
  children: ReactNode
}) {
  return (
    <div className="min-w-0">
      <div className="mb-1.5 flex items-center gap-2">
        <span className="bg-foreground text-background flex size-[18px] items-center justify-center rounded-full text-[10px] font-semibold">
          {n}
        </span>
        <span className="text-xs font-medium">{title}</span>
        {warn && (
          <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-500">
            {warn}
          </span>
        )}
      </div>
      {children}
    </div>
  )
}
