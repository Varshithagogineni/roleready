import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  connectCommand,
  createToken,
  listTokens,
  revokeToken,
  type McpToken,
} from "@/lib/mcpTokens"
import { Check, Copy, Loader2, Terminal, Trash2 } from "lucide-react"

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={async () => {
        await navigator.clipboard.writeText(value)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
    >
      {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
      {copied ? "Copied" : label}
    </Button>
  )
}

function when(iso: string | null): string {
  if (!iso) return "never"
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

/** "Use RoleReady in Claude" — generate a connection code, see and revoke
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
      /* listing is non-critical; the generate button still works */
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

  return (
    <div className="space-y-3 border-t pt-4">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Terminal className="size-4" />
          Use RoleReady in Claude
        </h3>
        <p className="text-muted-foreground mt-1 text-sm">
          Generate a connection code to research companies without leaving Claude.
          It runs on the API keys you saved above.
        </p>
      </div>

      {fresh ? (
        <div className="space-y-3 rounded-md border border-amber-500/40 bg-amber-500/5 p-3">
          <div>
            <Label className="text-xs">Your connection code</Label>
            <div className="mt-1 flex items-center gap-2">
              <code className="flex-1 truncate rounded bg-muted px-2 py-1.5 text-xs">
                {fresh}
              </code>
              <CopyButton value={fresh} label="Copy" />
            </div>
            <p className="mt-1.5 text-xs font-medium text-amber-600 dark:text-amber-500">
              Copy it now — it won't be shown again.
            </p>
          </div>

          <div>
            <Label className="text-xs">Then run this in your terminal</Label>
            <div className="mt-1 flex items-center gap-2">
              <code className="flex-1 truncate rounded bg-muted px-2 py-1.5 text-xs">
                {connectCommand(fresh)}
              </code>
              <CopyButton value={connectCommand(fresh)} label="Copy" />
            </div>
          </div>

          <Button variant="outline" size="sm" onClick={() => setFresh(null)}>
            Done
          </Button>
        </div>
      ) : (
        <div className="flex items-end gap-2">
          <div className="flex-1 space-y-1">
            <Label htmlFor="code-label" className="text-xs">
              Name (optional)
            </Label>
            <Input
              id="code-label"
              placeholder="My laptop"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>
          <Button onClick={handleGenerate} disabled={busy}>
            {busy && <Loader2 className="size-4 animate-spin" />}
            Generate code
          </Button>
        </div>
      )}

      {tokens.length > 0 && (
        <ul className="space-y-1">
          {tokens.map((t) => (
            <li
              key={t.id}
              className="flex items-center justify-between gap-2 rounded border px-2 py-1.5 text-xs"
            >
              <span className="truncate">
                <code>{t.token_prefix}…</code>
                {t.label && <span className="text-muted-foreground"> · {t.label}</span>}
                <span className="text-muted-foreground"> · last used {when(t.last_used_at)}</span>
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                title="Revoke this code"
                onClick={() => void handleRevoke(t.id)}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  )
}
