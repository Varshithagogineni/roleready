import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { upsertProfile, type Profile } from "@/lib/db"
import { Loader2, Plus, X } from "lucide-react"

interface Props {
  email: string
  defaultFirstName: string
  defaultLastName: string
  onDone: (profile: Profile) => void
}

const ROLE_SUGGESTIONS = [
  "ML Engineer",
  "AI Engineer",
  "Data Analyst",
  "Software Engineer",
  "Forward Deployed Engineer",
  "Data Scientist",
]

/** One-time onboarding: collect the details Google doesn't give us. */
export function OnboardingScreen({ email, defaultFirstName, defaultLastName, onDone }: Props) {
  const [firstName, setFirstName] = useState(defaultFirstName)
  const [lastName, setLastName] = useState(defaultLastName)
  const [phone, setPhone] = useState("")
  const [roles, setRoles] = useState<string[]>([])
  const [roleInput, setRoleInput] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSubmit = firstName.trim() && lastName.trim() && roles.length >= 1 && !saving

  function addRole(role: string) {
    const r = role.trim()
    if (r && roles.length < 3 && !roles.includes(r)) setRoles([...roles, r])
    setRoleInput("")
  }

  async function handleSubmit() {
    setSaving(true)
    setError(null)
    try {
      const profile = await upsertProfile({
        email,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        phone: phone.trim(),
        target_roles: roles,
      })
      onDone(profile)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save your profile.")
      setSaving(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <Card className="anim-fade-up w-full max-w-lg shadow-sm">
        <CardHeader>
          <CardTitle className="text-2xl">Set up your profile</CardTitle>
          <CardDescription>
            A few quick details so we can personalize your job prep. You can change these later.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="fn">First name</Label>
              <Input id="fn" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ln">Last name</Label>
              <Input id="ln" value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Email</Label>
            <Input value={email} disabled className="opacity-70" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">
              Phone <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="phone"
              placeholder="+1 (555) 000-0000"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>
              Roles you're targeting{" "}
              <span className="font-normal text-muted-foreground">(pick up to 3)</span>
            </Label>

            {roles.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {roles.map((r) => (
                  <span
                    key={r}
                    className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-sm text-primary"
                  >
                    {r}
                    <button onClick={() => setRoles(roles.filter((x) => x !== r))}>
                      <X className="size-3.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {roles.length < 3 && (
              <>
                <div className="flex gap-2">
                  <Input
                    placeholder="Type a role and press Enter"
                    value={roleInput}
                    onChange={(e) => setRoleInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault()
                        addRole(roleInput)
                      }
                    }}
                  />
                  <Button variant="outline" size="icon" onClick={() => addRole(roleInput)}>
                    <Plus className="size-4" />
                  </Button>
                </div>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {ROLE_SUGGESTIONS.filter((s) => !roles.includes(s)).map((s) => (
                    <button
                      key={s}
                      onClick={() => addRole(s)}
                      className="rounded-full border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
                    >
                      + {s}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <Button size="lg" className="btn-hero w-full" disabled={!canSubmit} onClick={handleSubmit}>
            {saving ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Creating your account...
              </>
            ) : (
              "Create my account"
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
