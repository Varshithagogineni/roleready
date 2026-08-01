import { useEffect, useState } from "react"
import confetti from "canvas-confetti"
import { ApplicationForm } from "@/components/ApplicationForm"
import { ChatWidget } from "@/components/ChatWidget"
import { LoginScreen } from "@/components/LoginScreen"
import { OnboardingScreen } from "@/components/OnboardingScreen"
import { ResultsDashboard, type Sectioned } from "@/components/ResultsDashboard"
import { SettingsDialog } from "@/components/SettingsDialog"
import { TailoredResumeSection } from "@/components/TailoredResumeSection"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useAuth } from "@/hooks/useAuth"
import { fetchFitScore, fetchPrepBundle } from "@/lib/api"
import { keyCache, loadKeys } from "@/lib/keys"
import {
  getApplications,
  getProfile,
  saveApplication,
  type ApplicationRow,
  type Profile,
} from "@/lib/db"
import type { ApplicationInput, FitResult, PeopleResult, PrepSheet } from "@/lib/types"
import { Clock, LogOut, Target } from "lucide-react"

const idle = { data: null, loading: false, error: null }

/** Compact text summary of the prep results, used to ground Ray's answers. */
function buildChatContext(prep: PrepSheet | null, fit: FitResult | null): string {
  const parts: string[] = []
  if (prep) {
    parts.push(`Company: ${prep.company_name} — ${prep.what_they_do}`)
    parts.push(`Industry: ${prep.industry}. Employees: ${prep.employees}. HQ: ${prep.headquarters}. Funding: ${prep.funding_stage}.`)
    if (prep.recent_news.length)
      parts.push("Recent news: " + prep.recent_news.map((n) => n.headline).join("; "))
    parts.push(
      `Visa sponsorship: ${prep.likely_sponsors ? "likely yes" : "unclear"} (${prep.sponsorship_confidence} confidence). Types found: ${prep.visa_types_mentioned.join(", ") || "none"}.`
    )
    if (prep.sponsorship_evidence.length)
      parts.push("Sponsorship evidence: " + prep.sponsorship_evidence.map((e) => e.finding).join("; "))
    if (prep.interview_questions.length)
      parts.push("Reported interview questions: " + prep.interview_questions.map((q) => q.question).join(" | "))
  }
  if (fit) {
    parts.push(`Resume fit score: ${fit.fit_score}/100. ${fit.score_breakdown}`)
    if (fit.strengths.length) parts.push("Strengths: " + fit.strengths.join("; "))
    if (fit.gaps.length) parts.push("Gaps: " + fit.gaps.join("; "))
    if (fit.remaining_gaps.length) parts.push("Hard gaps: " + fit.remaining_gaps.join("; "))
  }
  return parts.join("\n")
}

export default function App() {
  const { user, loading: authLoading, signInWithGoogle, signOut } = useAuth()

  // profile: undefined = loading, null = needs onboarding, Profile = ready
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined)
  const [justCreated, setJustCreated] = useState(false)
  const [apps, setApps] = useState<ApplicationRow[]>([])

  // undefined = dialog controls itself; true = force it open after sign-in.
  const [keysOpen, setKeysOpen] = useState<boolean | undefined>(undefined)

  const [submitted, setSubmitted] = useState<ApplicationInput | null>(null)
  const [prep, setPrep] = useState<Sectioned<PrepSheet>>(idle)
  const [fit, setFit] = useState<Sectioned<FitResult>>(idle)
  const [people, setPeople] = useState<Sectioned<PeopleResult>>(idle)

  const anyLoading = prep.loading || fit.loading || people.loading

  // Load the profile (and history) once the user is known.
  useEffect(() => {
    if (!user?.email) return
    getProfile(user.email)
      .then((p) => setProfile(p))
      .catch(() => setProfile(null)) // fall through to onboarding on error
  }, [user?.email])

  useEffect(() => {
    if (profile?.email) getApplications(profile.email).then(setApps).catch(() => {})
  }, [profile?.email])

  // Right after sign-in, if this user has never saved their own API keys, open
  // the BYO-keys dialog for them. `undefined` hands control back to the dialog
  // so the toolbar button keeps working normally.
  useEffect(() => {
    if (!user?.id) return
    loadKeys()
      .then((keys) => {
        if (!keys.gemini.trim() && !keys.tavily.trim()) setKeysOpen(true)
      })
      .catch(() => {})
  }, [user?.id])

  function handleOnboarded(p: Profile) {
    setProfile(p)
    setJustCreated(true)
    void confetti({ particleCount: 140, spread: 75, origin: { y: 0.6 } })
  }

  function handleSubmit(input: ApplicationInput) {
    setSubmitted(input)
    setPrep({ data: null, loading: true, error: null })
    setFit({ data: null, loading: true, error: null })
    setPeople({ data: null, loading: true, error: null })

    // One backend call returns company research + people (fewer Gemini requests).
    fetchPrepBundle(input.company, input.role)
      .then((bundle) => {
        setPrep({ data: bundle.prep_sheet, loading: false, error: null })
        setPeople({ data: bundle.people, loading: false, error: null })
      })
      .catch((e) => {
        setPrep({ data: null, loading: false, error: e.message })
        setPeople({ data: null, loading: false, error: e.message })
      })

    fetchFitScore(input.company, input.role, input.jd, input.resume!)
      .then((data) => {
        setFit({ data, loading: false, error: null })
        recordApplication(input, data.fit_score)
      })
      .catch((e) => {
        setFit({ data: null, loading: false, error: e.message })
        recordApplication(input, null)
      })
  }

  function recordApplication(input: ApplicationInput, score: number | null) {
    if (!profile?.email) return
    const row: ApplicationRow = {
      email: profile.email,
      company: input.company,
      role: input.role,
      fit_score: score,
    }
    void saveApplication(row).then(() =>
      getApplications(profile.email).then(setApps).catch(() => {})
    )
  }

  // ── Gates ──────────────────────────────────────────────────────────────────
  if (authLoading) return <div className="min-h-screen bg-background" />
  if (!user) return <LoginScreen onGoogleSignIn={() => void signInWithGoogle()} />
  if (profile === undefined) return <div className="min-h-screen bg-background" />
  if (profile === null) {
    const parts = ((user.user_metadata?.full_name as string) ?? "").split(" ")
    return (
      <OnboardingScreen
        email={user.email!}
        defaultFirstName={parts[0] ?? ""}
        defaultLastName={parts.slice(1).join(" ")}
        onDone={handleOnboarded}
      />
    )
  }

  const avatarUrl = user.user_metadata?.avatar_url as string | undefined

  return (
    <div className="min-h-screen bg-background">
      {anyLoading && <div className="top-loader" aria-hidden />}
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-white">
              <Target className="size-4.5" />
            </div>
            <span className="text-lg font-bold tracking-tight">RoleReady</span>
          </div>
          <div className="flex items-center gap-3">
            <SettingsDialog
              open={keysOpen}
              onOpenChange={(o) => setKeysOpen(o ? true : undefined)}
            />
            <div className="flex items-center gap-2">
              {avatarUrl ? (
                <img src={avatarUrl} alt="" className="size-7 rounded-full" referrerPolicy="no-referrer" />
              ) : (
                <div className="flex size-7 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                  {profile.first_name[0]?.toUpperCase()}
                </div>
              )}
              <span className="hidden text-sm font-medium sm:block">{profile.first_name}</span>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => {
                  keyCache.clear() // don't leave keys behind for the next user of this browser
                  void signOut()
                }}
                title="Sign out"
              >
                <LogOut className="size-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-10 px-4 py-10">
        {!submitted && (
          <section className="anim-fade-up mx-auto max-w-2xl space-y-3 text-center">
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
              Welcome back,{" "}
              <span className="bg-gradient-to-r from-indigo-500 to-violet-600 bg-clip-text text-transparent">
                {profile.first_name}
              </span>
            </h1>
            <p className="text-lg text-muted-foreground">
              Enter a job below — we research the company, check visa signals, find people to
              connect with, and tailor your resume.
            </p>
          </section>
        )}

        <section className="anim-fade-up anim-d2 mx-auto max-w-2xl">
          <ApplicationForm
            loading={anyLoading}
            onSubmit={handleSubmit}
            defaultRole={profile.target_roles[0] ?? ""}
            roleSuggestions={profile.target_roles}
          />
        </section>

        {/* Recent applications (landing only) */}
        {!submitted && apps.length > 0 && (
          <section className="anim-fade-up anim-d3 mx-auto max-w-2xl">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Clock className="size-4" /> Recent applications
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {apps.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center justify-between border-b py-2 text-sm last:border-0"
                  >
                    <span>
                      <span className="font-medium">{a.company}</span>
                      <span className="text-muted-foreground"> · {a.role}</span>
                    </span>
                    {a.fit_score != null && (
                      <span className="font-semibold text-primary">{a.fit_score}/100</span>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          </section>
        )}

        {submitted && (
          <section>
            <ResultsDashboard
              company={submitted.company}
              role={submitted.role}
              prep={prep}
              fit={fit}
              people={people}
              tailorSlot={
                <TailoredResumeSection
                  key={`${submitted.company}-${submitted.role}`}
                  input={submitted}
                />
              }
            />
          </section>
        )}
      </main>

      <footer className="border-t py-6 text-center text-xs text-muted-foreground">
        RoleReady — built for international students. Sponsorship signals are evidence-based,
        never a guarantee.
      </footer>

      {/* Ray — grounded chat assistant, available once results exist */}
      {submitted && (prep.data || fit.data) && (
        <ChatWidget
          company={submitted.company}
          role={submitted.role}
          context={buildChatContext(prep.data, fit.data)}
        />
      )}

      {/* Account-created celebration */}
      <Dialog open={justCreated} onOpenChange={setJustCreated}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-2xl">🎉 Account created!</DialogTitle>
            <DialogDescription>
              Welcome to RoleReady, {profile.first_name}. Your profile is saved — let's find you a
              role you're ready for.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button className="btn-hero w-full" onClick={() => setJustCreated(false)}>
              Start prepping
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
