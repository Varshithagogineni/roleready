import { useState } from "react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import { fetchTailoredResume } from "@/lib/api"
import type { ApplicationInput, TailoredResume } from "@/lib/types"
import { AlertTriangle, Download, Eye, Loader2, Sparkles } from "lucide-react"

/** Minimal markdown → HTML for resume bullets (bold + bullet lists only). */
function mdToHtml(md: string): string {
  const esc = md
    .replace(/[□◻▢]/g, "") // strip icon-font placeholders leaked from PDFs
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
  const bolded = esc
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*\n]+)\*/g, "<em>$1</em>")
  const lines = bolded.split("\n")
  let html = ""
  let inList = false
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith("- ") || trimmed.startsWith("• ")) {
      if (!inList) {
        html += "<ul>"
        inList = true
      }
      html += `<li>${trimmed.slice(2)}</li>`
    } else {
      if (inList) {
        html += "</ul>"
        inList = false
      }
      if (trimmed) html += `<p>${trimmed}</p>`
    }
  }
  if (inList) html += "</ul>"
  return html
}

function resumeToMarkdown(r: TailoredResume): string {
  const parts = [
    `# ${r.full_name}`,
    r.headline,
    r.contact_line,
    "",
    ...r.sections.flatMap((s) => [`## ${s.heading}`, s.content_markdown, ""]),
  ]
  return parts.join("\n")
}

interface Props {
  input: ApplicationInput
}

/** "Generate tailored resume" button + document-style preview dialog. */
export function TailoredResumeSection({ input }: Props) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resume, setResume] = useState<TailoredResume | null>(null)

  async function handleGenerate() {
    if (!input.resume) return
    setOpen(true)
    if (resume || loading) return // already generated for this run
    setLoading(true)
    setError(null)
    try {
      const result = await fetchTailoredResume(input.company, input.role, input.jd, input.resume)
      setResume(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to tailor resume.")
    } finally {
      setLoading(false)
    }
  }

  function handleDownload() {
    if (!resume) return
    const blob = new Blob([resumeToMarkdown(resume)], { type: "text/markdown" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${resume.full_name.replace(/\s+/g, "_")}_${input.company}_${input.role}.md`.replace(/\s+/g, "_")
    a.click()
    URL.revokeObjectURL(url)
  }

  /** Print ONLY the resume document — in a clean window styled for paper. */
  function handlePrint() {
    if (!resume) return
    const clean = (s: string) => s.replace(/[□◻▢]/g, "").replace(/\s{2,}/g, " ")
    const sectionsHtml = resume.sections
      .map(
        (s) => `
        <h2>${s.heading}</h2>
        ${mdToHtml(s.content_markdown)}`
      )
      .join("")
    const w = window.open("", "_blank", "width=800,height=1000")
    if (!w) return
    w.document.write(`<!doctype html>
<html><head><title>${resume.full_name} — ${input.role}</title>
<style>
  body { font-family: Georgia, "Times New Roman", serif; font-size: 12.5px; line-height: 1.45;
         color: #171717; max-width: 7.5in; margin: 0 auto; padding: 24px; }
  .name { text-align: center; font-size: 24px; font-weight: 700; margin: 0; }
  .headline { text-align: center; font-style: italic; color: #525252; margin: 2px 0; }
  .contact { text-align: center; font-size: 11px; color: #737373; margin: 2px 0 10px; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .04em;
       border-bottom: 1px solid #a3a3a3; padding-bottom: 2px; margin: 14px 0 6px; }
  ul { margin: 4px 0; padding-left: 18px; }
  li { margin: 2px 0; }
  p { margin: 4px 0; }
  @media print { body { padding: 0; } }
</style></head>
<body>
  <p class="name">${resume.full_name}</p>
  <p class="headline">${clean(resume.headline)}</p>
  <p class="contact">${clean(resume.contact_line)}</p>
  ${sectionsHtml}
</body></html>`)
    w.document.close()
    w.focus()
    setTimeout(() => w.print(), 300)
  }

  return (
    <>
      <div className="rounded-lg border bg-gradient-to-r from-indigo-50 to-violet-50 p-4 dark:from-indigo-950/40 dark:to-violet-950/40">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-semibold">Full tailored resume</p>
            <p className="text-sm text-muted-foreground">
              Rewrite your entire resume for {input.company} — with a live preview.
            </p>
          </div>
          <Button className="btn-hero" onClick={handleGenerate}>
            <Sparkles className="size-4" />
            {resume ? "View tailored resume" : "Generate tailored resume"}
          </Button>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Tailored resume — {input.role} @ {input.company}</DialogTitle>
            <DialogDescription>
              Reworded and reordered for this role. Nothing invented — verify before sending.
            </DialogDescription>
          </DialogHeader>

          {loading && (
            <div className="flex flex-col items-center gap-3 py-12 text-muted-foreground">
              <Loader2 className="size-6 animate-spin" />
              <p className="text-sm">Tailoring your resume for {input.company}...</p>
            </div>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="size-4" />
              <AlertTitle>Couldn't tailor the resume</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {resume && (
            <div className="space-y-5">
              {/* Document-style preview */}
              <div className="rounded-lg border bg-white p-8 font-serif text-[13.5px] leading-relaxed text-neutral-900 shadow-sm dark:bg-neutral-50">
                <div className="text-center">
                  <h1 className="text-2xl font-bold tracking-tight">{resume.full_name}</h1>
                  <p className="mt-0.5 text-sm italic text-neutral-600">{resume.headline}</p>
                  <p className="mt-0.5 text-xs text-neutral-500">
                    {resume.contact_line.replace(/[□◻▢]/g, "").replace(/\s{2,}/g, " ")}
                  </p>
                </div>
                {resume.sections.map((s) => (
                  <div key={s.heading} className="mt-4">
                    <h2 className="border-b border-neutral-300 pb-0.5 text-sm font-bold uppercase tracking-wide">
                      {s.heading}
                    </h2>
                    <div
                      className="mt-1.5 space-y-1 [&_li]:ml-4 [&_li]:list-disc [&_p]:mt-1"
                      dangerouslySetInnerHTML={{ __html: mdToHtml(s.content_markdown) }}
                    />
                  </div>
                ))}
              </div>

              <Separator />

              <div>
                <h3 className="mb-2 flex items-center gap-2 font-semibold">
                  <Eye className="size-4" /> What changed & why
                </h3>
                <ul className="list-inside list-decimal space-y-1.5 text-sm">
                  {resume.changes.map((c) => (
                    <li key={c.slice(0, 48)}>{c}</li>
                  ))}
                </ul>
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={handleDownload}>
                  <Download className="size-4" /> Download (.md)
                </Button>
                <Button onClick={handlePrint}>Print / Save as PDF</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
