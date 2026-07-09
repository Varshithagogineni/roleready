/** Types mirroring backend/pipeline.py Pydantic schemas. */

export interface NewsItem {
  headline: string
  source_url: string
}

export interface SponsorshipEvidence {
  finding: string
  source_url: string
}

export interface InterviewQuestion {
  question: string
  source_url: string
  tip: string
}

export interface PrepSheet {
  company_name: string
  what_they_do: string
  industry: string
  employees: string
  headquarters: string
  funding_stage: string
  recent_news: NewsItem[]
  likely_sponsors: boolean
  sponsorship_confidence: "high" | "medium" | "low"
  sponsorship_evidence: SponsorshipEvidence[]
  visa_types_mentioned: string[]
  sponsorship_disclaimer: string
  interview_questions: InterviewQuestion[]
}

export interface TailoredBullet {
  original: string
  tailored: string
  what_changed: string
}

export interface FitResult {
  fit_score: number
  score_breakdown: string
  strengths: string[]
  gaps: string[]
  tailored_summary: string
  tailored_bullets: TailoredBullet[]
  remaining_gaps: string[]
}

export interface Person {
  name: string
  title: string
  profile_url: string
  why_connect: string
}

export interface PeopleResult {
  people: Person[]
  note: string
}

export interface ResumeSection {
  heading: string
  content_markdown: string
}

export interface TailoredResume {
  full_name: string
  headline: string
  contact_line: string
  sections: ResumeSection[]
  changes: string[]
}

export interface ApplicationInput {
  company: string
  role: string
  jd: string
  resume: File | null
}
