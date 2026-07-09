import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScoreRing, scoreLabel, scoreColor } from "@/components/ScoreRing"
import type { FitResult, PeopleResult, PrepSheet } from "@/lib/types"
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  ExternalLink,
  Landmark,
  Lightbulb,
  MapPin,
  Newspaper,
  Users,
  XCircle,
} from "lucide-react"

export interface Sectioned<T> {
  data: T | null
  loading: boolean
  error: string | null
}

interface Props {
  company: string
  role: string
  prep: Sectioned<PrepSheet>
  fit: Sectioned<FitResult>
  people: Sectioned<PeopleResult>
  tailorSlot: React.ReactNode
}

function SectionSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-5 w-2/3" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-5/6" />
      <Skeleton className="h-4 w-4/6" />
    </div>
  )
}

function SectionError({ message }: { message: string }) {
  return (
    <Alert variant="destructive">
      <AlertTriangle className="size-4" />
      <AlertTitle>Couldn't load this section</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  )
}

/** Full results area: summary cards + Company / Visa / Resume / Interview / People tabs. */
export function ResultsDashboard({ company, role, prep, fit, people, tailorSlot }: Props) {
  return (
    <div className="space-y-6">
      <div className="anim-fade-up">
        <h2 className="text-2xl font-semibold tracking-tight">
          {prep.data?.company_name ?? company}{" "}
          <span className="text-muted-foreground font-normal">· {role}</span>
        </h2>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="anim-fade-up anim-d1">
          <CardContent className="flex flex-col items-center gap-1 pt-4">
            {fit.loading ? (
              <Skeleton className="size-[132px] rounded-full" />
            ) : fit.data ? (
              <>
                <ScoreRing score={fit.data.fit_score} />
                <span
                  className="text-sm font-semibold"
                  style={{ color: scoreColor(fit.data.fit_score) }}
                >
                  {scoreLabel(fit.data.fit_score)}
                </span>
              </>
            ) : (
              <span className="py-10 text-sm text-muted-foreground">Fit score unavailable</span>
            )}
          </CardContent>
        </Card>

        <Card className="anim-fade-up anim-d2">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">
              Visa sponsor
            </CardTitle>
          </CardHeader>
          <CardContent>
            {prep.loading ? (
              <SectionSkeleton />
            ) : prep.data ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-2xl font-semibold">
                  {prep.data.likely_sponsors ? (
                    <>
                      <CheckCircle2 className="size-6 text-emerald-500" /> Likely yes
                    </>
                  ) : (
                    <>
                      <XCircle className="size-6 text-amber-500" /> Unclear
                    </>
                  )}
                </div>
                <Badge variant="secondary" className="uppercase">
                  {prep.data.sponsorship_confidence} confidence
                </Badge>
              </div>
            ) : (
              <span className="text-sm text-muted-foreground">—</span>
            )}
          </CardContent>
        </Card>

        <Card className="anim-fade-up anim-d3">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">
              Visa types found
            </CardTitle>
          </CardHeader>
          <CardContent>
            {prep.loading ? (
              <SectionSkeleton />
            ) : (
              <div className="flex flex-wrap gap-2">
                {prep.data?.visa_types_mentioned.length ? (
                  prep.data.visa_types_mentioned.map((v) => (
                    <Badge key={v} variant="outline" className="text-sm">
                      {v}
                    </Badge>
                  ))
                ) : (
                  <span className="text-sm text-muted-foreground">None found yet</span>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Detail tabs */}
      <Tabs defaultValue="company">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="company">
            <Building2 className="size-4" /> Company
          </TabsTrigger>
          <TabsTrigger value="visa">
            <Landmark className="size-4" /> Visa
          </TabsTrigger>
          <TabsTrigger value="resume">
            <Lightbulb className="size-4" /> Resume
          </TabsTrigger>
          <TabsTrigger value="interview">
            <Newspaper className="size-4" /> Interview
          </TabsTrigger>
          <TabsTrigger value="people">
            <Users className="size-4" /> People
          </TabsTrigger>
        </TabsList>

        {/* ── Company ── */}
        <TabsContent value="company" className="space-y-4 pt-4">
          {prep.loading ? (
            <SectionSkeleton />
          ) : prep.error ? (
            <SectionError message={prep.error} />
          ) : prep.data ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <Card>
                  <CardContent className="space-y-2 pt-4 text-sm">
                    <p>{prep.data.what_they_do}</p>
                    <p className="text-muted-foreground">{prep.data.industry}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="space-y-2 pt-4 text-sm">
                    <p className="flex items-center gap-2">
                      <Users className="size-4 text-muted-foreground" />
                      {prep.data.employees}
                    </p>
                    <p className="flex items-center gap-2">
                      <MapPin className="size-4 text-muted-foreground" />
                      {prep.data.headquarters}
                    </p>
                    <p className="flex items-center gap-2">
                      <Landmark className="size-4 text-muted-foreground" />
                      {prep.data.funding_stage}
                    </p>
                  </CardContent>
                </Card>
              </div>
              <div>
                <h3 className="mb-2 font-semibold">Recent news</h3>
                <ul className="space-y-2">
                  {prep.data.recent_news.map((n) => (
                    <li key={n.source_url + n.headline}>
                      <a
                        href={n.source_url}
                        target="_blank"
                        rel="noreferrer"
                        className="group flex items-start gap-2 text-sm hover:text-primary"
                      >
                        <ExternalLink className="mt-0.5 size-3.5 shrink-0 text-muted-foreground group-hover:text-primary" />
                        {n.headline}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          ) : null}
        </TabsContent>

        {/* ── Visa ── */}
        <TabsContent value="visa" className="space-y-4 pt-4">
          {prep.loading ? (
            <SectionSkeleton />
          ) : prep.error ? (
            <SectionError message={prep.error} />
          ) : prep.data ? (
            <>
              <div className="space-y-3">
                {prep.data.sponsorship_evidence.map((ev) => (
                  <Card key={ev.source_url + ev.finding.slice(0, 24)}>
                    <CardContent className="pt-4 text-sm">
                      <p>{ev.finding}</p>
                      <a
                        href={ev.source_url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        <ExternalLink className="size-3" /> Source
                      </a>
                    </CardContent>
                  </Card>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                ⚠️ {prep.data.sponsorship_disclaimer}
              </p>
            </>
          ) : null}
        </TabsContent>

        {/* ── Resume ── */}
        <TabsContent value="resume" className="space-y-4 pt-4">
          {fit.loading ? (
            <SectionSkeleton />
          ) : fit.error ? (
            <SectionError message={fit.error} />
          ) : fit.data ? (
            <>
              <Alert>
                <Lightbulb className="size-4" />
                <AlertDescription>{fit.data.score_breakdown}</AlertDescription>
              </Alert>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <h3 className="mb-2 font-semibold text-emerald-600">Strengths</h3>
                  <ul className="space-y-1.5 text-sm">
                    {fit.data.strengths.map((s) => (
                      <li key={s.slice(0, 40)} className="flex gap-2">
                        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" />
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3 className="mb-2 font-semibold text-amber-600">Gaps</h3>
                  <ul className="space-y-1.5 text-sm">
                    {fit.data.gaps.map((g) => (
                      <li key={g.slice(0, 40)} className="flex gap-2">
                        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" />
                        {g}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div>
                <h3 className="mb-2 font-semibold">Tailored bullets</h3>
                <div className="space-y-3">
                  {fit.data.tailored_bullets.map((b) => (
                    <Card key={b.original.slice(0, 40)}>
                      <CardContent className="space-y-2 pt-4 text-sm">
                        <p className="text-muted-foreground line-through decoration-muted-foreground/40">
                          {b.original}
                        </p>
                        <p className="font-medium">{b.tailored}</p>
                        <p className="text-xs text-muted-foreground">🔄 {b.what_changed}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>

              {fit.data.remaining_gaps.length > 0 && (
                <div>
                  <h3 className="mb-2 font-semibold">
                    Remaining gaps{" "}
                    <span className="font-normal text-muted-foreground">
                      (can't be fixed by rewording)
                    </span>
                  </h3>
                  <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
                    {fit.data.remaining_gaps.map((g) => (
                      <li key={g.slice(0, 40)}>{g}</li>
                    ))}
                  </ul>
                </div>
              )}

              {tailorSlot}
            </>
          ) : null}
        </TabsContent>

        {/* ── Interview ── */}
        <TabsContent value="interview" className="space-y-4 pt-4">
          {prep.loading ? (
            <SectionSkeleton />
          ) : prep.error ? (
            <SectionError message={prep.error} />
          ) : prep.data ? (
            <>
              <p className="text-sm text-muted-foreground">
                Questions candidates actually reported — with sources.
              </p>
              <div className="space-y-3">
                {prep.data.interview_questions.map((q, i) => (
                  <Card key={q.question.slice(0, 40)}>
                    <CardContent className="space-y-2 pt-4">
                      <p className="text-sm font-medium">
                        Q{i + 1}: {q.question}
                      </p>
                      <p className="text-xs text-muted-foreground">💡 {q.tip}</p>
                      {q.source_url && (
                        <a
                          href={q.source_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          <ExternalLink className="size-3" /> Reported here
                        </a>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          ) : null}
        </TabsContent>

        {/* ── People ── */}
        <TabsContent value="people" className="space-y-4 pt-4">
          {people.loading ? (
            <SectionSkeleton />
          ) : people.error ? (
            <SectionError message={people.error} />
          ) : people.data ? (
            <>
              <p className="text-sm text-muted-foreground">{people.data.note}</p>
              {people.data.people.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No public profiles found for this company/role combination.
                </p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {people.data.people.map((p) => (
                    <Card className="hover-lift" key={p.profile_url + p.name}>
                      <CardContent className="space-y-1.5 pt-4">
                        <div className="flex items-center gap-2">
                          <div className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                            {p.name
                              .split(" ")
                              .map((w) => w[0])
                              .slice(0, 2)
                              .join("")}
                          </div>
                          <div>
                            <p className="text-sm font-semibold">{p.name}</p>
                            <p className="text-xs text-muted-foreground">{p.title}</p>
                          </div>
                        </div>
                        <p className="text-xs">{p.why_connect}</p>
                        <a
                          href={p.profile_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          <ExternalLink className="size-3" /> View profile
                        </a>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </>
          ) : null}
        </TabsContent>
      </Tabs>
    </div>
  )
}
