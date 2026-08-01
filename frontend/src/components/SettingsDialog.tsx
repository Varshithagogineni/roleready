import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAuth } from "@/hooks/useAuth"
import { validateKeys } from "@/lib/api"
import { keyCache, loadKeys, saveKeys } from "@/lib/keys"
import { KeyRound, Loader2 } from "lucide-react"

type KeyStatus = boolean | null

function StatusDot({ status }: { status: KeyStatus }) {
  if (status === null) return null
  return (
    <span
      className={`ml-2 inline-block size-2 rounded-full ${
        status ? "bg-emerald-500" : "bg-red-500"
      }`}
    />
  )
}

interface SettingsDialogProps {
  /** Controlled open state — App opens this automatically right after sign-in
   *  when the user has no keys saved yet. Omit for the normal toolbar button. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

/** Bring-your-own-API-keys dialog. Keys are saved to the signed-in user's
 *  Supabase account, so they work in the web app AND the RoleReady MCP server. */
export function SettingsDialog({ open: openProp, onOpenChange }: SettingsDialogProps = {}) {
  const { user } = useAuth()
  const [openState, setOpenState] = useState(false)
  const open = openProp ?? openState

  function setOpen(next: boolean) {
    setOpenState(next)
    onOpenChange?.(next)
  }

  const [gemini, setGemini] = useState("")
  const [tavily, setTavily] = useState("")
  const [checking, setChecking] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [geminiStatus, setGeminiStatus] = useState<KeyStatus>(null)
  const [tavilyStatus, setTavilyStatus] = useState<KeyStatus>(null)

  // Pull the saved keys from Supabase whenever the dialog opens.
  useEffect(() => {
    if (!open) return
    const cached = keyCache.get()
    setGemini(cached.gemini)
    setTavily(cached.tavily)
    loadKeys()
      .then((keys) => {
        setGemini(keys.gemini)
        setTavily(keys.tavily)
      })
      .catch(() => {
        /* keep the cached values */
      })
  }, [open])

  async function handleTest() {
    if (!gemini.trim() && !tavily.trim()) return
    setChecking(true)
    try {
      const result = await validateKeys(gemini, tavily)
      setGeminiStatus(result.gemini)
      setTavilyStatus(result.tavily)
    } finally {
      setChecking(false)
    }
  }

  async function handleSave() {
    if (!user) {
      setError("Sign in with Google first so your keys can be saved to your account.")
      return
    }
    setSaving(true)
    setError(null)
    try {
      await saveKeys(user.id, { gemini, tavily })
      setOpen(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save your keys.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            <KeyRound className="size-4" />
            API keys
            {keyCache.hasAny() && (
              <span className="size-2 rounded-full bg-emerald-500" />
            )}
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Use your own API keys</DialogTitle>
          <DialogDescription>
            RoleReady runs on your own free Gemini and Tavily keys. They're saved
            to your account, so they work here and in the RoleReady MCP server
            from Claude. Both have generous free tiers.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="gemini-key">
              Gemini API key
              <StatusDot status={geminiStatus} />
            </Label>
            <Input
              id="gemini-key"
              type="password"
              placeholder="AIza... (aistudio.google.com/apikey)"
              value={gemini}
              onChange={(e) => {
                setGemini(e.target.value)
                setGeminiStatus(null)
              }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tavily-key">
              Tavily API key
              <StatusDot status={tavilyStatus} />
            </Label>
            <Input
              id="tavily-key"
              type="password"
              placeholder="tvly-... (app.tavily.com)"
              value={tavily}
              onChange={(e) => {
                setTavily(e.target.value)
                setTavilyStatus(null)
              }}
            />
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleTest}
            disabled={checking || (!gemini.trim() && !tavily.trim())}
          >
            {checking && <Loader2 className="size-4 animate-spin" />}
            Test keys
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
