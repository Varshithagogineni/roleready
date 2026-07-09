import { useState } from "react"
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
import { keyStore, validateKeys } from "@/lib/api"
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

/** Bring-your-own-API-keys dialog. Keys are stored only in localStorage. */
export function SettingsDialog() {
  const [open, setOpen] = useState(false)
  const [gemini, setGemini] = useState(keyStore.getGemini())
  const [tavily, setTavily] = useState(keyStore.getTavily())
  const [checking, setChecking] = useState(false)
  const [geminiStatus, setGeminiStatus] = useState<KeyStatus>(null)
  const [tavilyStatus, setTavilyStatus] = useState<KeyStatus>(null)

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

  function handleSave() {
    keyStore.save(gemini, tavily)
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            <KeyRound className="size-4" />
            API keys
            {keyStore.hasAny() && (
              <span className="size-2 rounded-full bg-emerald-500" />
            )}
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Use your own API keys</DialogTitle>
          <DialogDescription>
            Your keys are stored only in this browser and used just for your
            requests. Leave blank to use the app's shared keys (rate-limited).
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
          <Button onClick={handleSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
