"""Pydantic schemas — the typed contract between the AI pipeline, the API, and
the React frontend (mirrored in frontend/src/lib/types.ts)."""

from typing import List, Literal

from pydantic import BaseModel, Field


# ── Prep sheet ────────────────────────────────────────────────────────────────

class NewsItem(BaseModel):
    headline: str
    source_url: str


class SponsorshipEvidence(BaseModel):
    finding: str
    source_url: str


class InterviewQuestion(BaseModel):
    question: str = Field(description="A question actually reported by candidates for this company/role")
    source_url: str = Field(description="URL where it was reported; empty string if none")
    tip: str = Field(description="1-line tip on how to approach it")


class PrepSheet(BaseModel):
    company_name: str
    what_they_do: str
    industry: str
    employees: str
    headquarters: str
    funding_stage: str
    recent_news: List[NewsItem]
    likely_sponsors: bool
    sponsorship_confidence: Literal["high", "medium", "low"]
    sponsorship_evidence: List[SponsorshipEvidence]
    visa_types_mentioned: List[str]
    sponsorship_disclaimer: str
    interview_questions: List[InterviewQuestion]


# ── People ────────────────────────────────────────────────────────────────────

class Person(BaseModel):
    name: str
    title: str = Field(description="Their role/title at the company")
    profile_url: str = Field(description="LinkedIn or public profile URL")
    why_connect: str = Field(description="1 sentence: why this person is worth connecting with for this application")


class PeopleResult(BaseModel):
    people: List[Person] = Field(description="Up to 6 real people found in the sources")
    note: str = Field(description="Short honesty note about how this list was gathered")


class PrepBundle(BaseModel):
    """Company research + people, produced in ONE Gemini call to save quota."""
    prep_sheet: PrepSheet
    people: PeopleResult


# ── Fit score ─────────────────────────────────────────────────────────────────

class TailoredBullet(BaseModel):
    original: str
    tailored: str
    what_changed: str


class FitResult(BaseModel):
    fit_score: int = Field(ge=0, le=100)
    score_breakdown: str
    strengths: List[str]
    gaps: List[str]
    tailored_summary: str
    tailored_bullets: List[TailoredBullet]
    remaining_gaps: List[str]


# ── Job posting (link extraction) ─────────────────────────────────────────────

class JobPosting(BaseModel):
    company: str = Field(description="Company name hiring for this role")
    role: str = Field(description="Job title, e.g. 'ML Engineer'")
    job_description: str = Field(
        description="The job description: responsibilities, requirements, qualifications — cleaned plain text, preserving the important details"
    )


# ── Tailored resume ───────────────────────────────────────────────────────────

class ResumeSection(BaseModel):
    heading: str = Field(description="Section heading, e.g. SUMMARY, SKILLS, EXPERIENCE")
    content_markdown: str = Field(description="Section body in clean markdown (bullets with -, bold with **)")


class TailoredResume(BaseModel):
    full_name: str
    headline: str = Field(description="1-line professional headline tailored to the target role")
    contact_line: str = Field(description="Phone | email | links, taken from the original resume")
    sections: List[ResumeSection] = Field(description="Resume sections in order")
    changes: List[str] = Field(description="Step-by-step list of what changed vs the original and why")


# ── Chat (Ray) ────────────────────────────────────────────────────────────────

class ChatSource(BaseModel):
    title: str
    url: str


class ChatReply(BaseModel):
    answer: str
    sources: List[ChatSource]
    answered_by: Literal["coach", "web"] = "coach"
