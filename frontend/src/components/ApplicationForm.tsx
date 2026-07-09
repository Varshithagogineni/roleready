import { useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { fetchJobFromUrl } from "@/lib/api"
import type { ApplicationInput } from "@/lib/types"
import { FileText, Link2, Loader2, PencilLine, Rocket, Upload } from "lucide-react"

interface Props {
  loading: boolean
  onSubmit: (input: ApplicationInput) => void
  defaultRole?: string
  roleSuggestions?: string[]
}

type Mode = "link" | "manual"

/** Two ways to start a prep: paste a job link, or enter details manually.
 *  Both just need a resume. Link mode extracts company/role/JD on submit. */
export function ApplicationForm({ loading, onSubmit, defaultRole = "", roleSuggestions = [] }: Props) {
  const [mode, setMode] = useState<Mode>("link")

  // Manual mode
  const [company, setCompany] = useState("")
  const [role, setRole] = useState(defaultRole)
  const [jd, setJd] = useState("")

  // Link mode
  const [jobUrl, setJobUrl] = useState("")
  const [extracting, setExtracting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Shared
  const [resume, setResume] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const busy = loading || extracting
  const canSubmit =
    resume !== null &&
    !busy &&
    (mode === "link" ? jobUrl.trim() !== "" : company.trim() !== "" && role.trim() !== "")

  async function handleSubmit() {
    if (!resume) return
    setError(null)

    if (mode === "manual") {
      onSubmit({ company: company.trim(), role: role.trim(), jd, resume })
      return
    }

    // Link mode: read the posting first, then run the pipeline.
    setExtracting(true)
    try {
      const job = await fetchJobFromUrl(jobUrl.trim())
      onSubmit({
        company: job.company,
        role: job.role,
        jd: job.job_description,
        resume,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read that job link.")
    } finally {
      setExtracting(false)
    }
  }

  const buttonLabel = extracting
    ? "Reading the job posting..."
    : loading
      ? "Researching..."
      : "Prep me"

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle>Your application</CardTitle>
        <CardDescription>
          Paste a job link or enter the details — plus your resume — and we'll do the rest.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
          <TabsList className="w-full">
            <TabsTrigger value="link" className="flex-1">
              <Link2 className="size-4" /> Job link
            </TabsTrigger>
            <TabsTrigger value="manual" className="flex-1">
              <PencilLine className="size-4" /> Enter manually
            </TabsTrigger>
          </TabsList>

          {/* ── Link mode ── */}
          <TabsContent value="link" className="space-y-2 pt-4">
            <Label htmlFor="job-url">Job posting URL</Label>
            <Input
              id="job-url"
              placeholder="Paste a LinkedIn, Greenhouse, Lever, or careers-page link"
              value={jobUrl}
              onChange={(e) => {
                setJobUrl(e.target.value)
                setError(null)
              }}
            />
            <p className="text-xs text-muted-foreground">
              We'll read the posting and pull the company, role, and description automatically.
            </p>
          </TabsContent>

          {/* ── Manual mode ── */}
          <TabsContent value="manual" className="space-y-4 pt-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="company">Company</Label>
                <Input
                  id="company"
                  placeholder="e.g. Anthropic"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="role">Role</Label>
                <Input
                  id="role"
                  placeholder="e.g. ML Engineer"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                />
                {roleSuggestions.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {roleSuggestions.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setRole(s)}
                        className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors hover:border-primary/50 ${
                          role === s ? "border-primary/60 bg-primary/10 text-primary" : "text-muted-foreground"
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="jd">
                Job description{" "}
                <span className="font-normal text-muted-foreground">(optional, sharpens the fit score)</span>
              </Label>
              <Textarea
                id="jd"
                placeholder="Paste the full job description here..."
                className="min-h-28"
                value={jd}
                onChange={(e) => setJd(e.target.value)}
              />
            </div>
          </TabsContent>
        </Tabs>

        <Separator />

        {/* Shared: resume + submit */}
        <div className="space-y-2">
          <Label>Resume (PDF)</Label>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => setResume(e.target.files?.[0] ?? null)}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-input px-4 py-6 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:bg-accent"
          >
            {resume ? (
              <>
                <FileText className="size-4 text-primary" />
                <span className="font-medium text-foreground">{resume.name}</span>
                <span className="text-xs">— click to change</span>
              </>
            ) : (
              <>
                <Upload className="size-4" />
                Click to upload your resume PDF
              </>
            )}
          </button>
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <Button
          size="lg"
          className="btn-hero w-full"
          disabled={!canSubmit}
          onClick={handleSubmit}
        >
          {busy ? (
            <>
              <Loader2 className="size-4 animate-spin" /> {buttonLabel}
            </>
          ) : (
            <>
              <Rocket className="size-4" /> {buttonLabel}
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  )
}
