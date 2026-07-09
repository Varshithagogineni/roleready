"""Facade for the RoleReady AI pipeline.

The implementation lives in focused modules:
  - config.py        — Gemini client, rate limiter, retry engine, key validation
  - schemas.py       — Pydantic models (API contract)
  - tavily_utils.py  — parallel web search + direct-answer helpers
  - research.py      — job-link extraction, prep bundle, prep sheet, people
  - resume.py        — fit score, tailored resume
  - chat_engine.py   — Ray (grounded chatbot with Gemini↔Tavily routing)

This module re-exports the public surface so callers can simply
`from backend import pipeline` and use `pipeline.<name>`.
"""

from backend.config import (
    DailyQuotaError,
    make_llm,
    run_gemini,
    tavily_client,
    validate_gemini_key,
    validate_tavily_key,
)
from backend.schemas import (
    ChatReply,
    ChatSource,
    FitResult,
    InterviewQuestion,
    JobPosting,
    NewsItem,
    PeopleResult,
    Person,
    PrepBundle,
    PrepSheet,
    ResumeSection,
    SponsorshipEvidence,
    TailoredBullet,
    TailoredResume,
)
from backend.research import (
    build_prep_sheet,
    extract_job_posting,
    find_people,
    prep_bundle,
)
from backend.resume import run_fit_score, tailor_resume
from backend.chat_engine import chat

__all__ = [
    # infra
    "DailyQuotaError", "make_llm", "run_gemini", "tavily_client",
    "validate_gemini_key", "validate_tavily_key",
    # schemas
    "ChatReply", "ChatSource", "FitResult", "InterviewQuestion", "JobPosting",
    "NewsItem", "PeopleResult", "Person", "PrepBundle", "PrepSheet",
    "ResumeSection", "SponsorshipEvidence", "TailoredBullet", "TailoredResume",
    # features
    "build_prep_sheet", "extract_job_posting", "find_people", "prep_bundle",
    "run_fit_score", "tailor_resume", "chat",
]
