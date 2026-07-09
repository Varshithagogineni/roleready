"""Resume features — fit score and full tailored rewrite. Both operate on the
user's private resume + JD, so they inherently need the LLM (no Tavily offload)."""

from typing import Optional

from backend.config import make_llm, run_gemini
from backend.schemas import FitResult, TailoredResume


def run_fit_score(
    resume_text: str, company: str, role: str, jd: str,
    gemini_key: Optional[str] = None,
) -> FitResult:
    llm = make_llm(gemini_key).with_structured_output(FitResult)
    return run_gemini(lambda: llm.invoke(f"""You are an expert resume coach.

Company: {company}  |  Role: {role}

Job Description:
{jd[:6000]}

Candidate's resume:
{resume_text[:8000]}

Score the fit honestly (0-100), list strengths and gaps, rewrite the 5-7 most
relevant bullets for this specific company, and list gaps that can't be fixed
by rewording. Only reword/reframe — never invent experience."""), cap=30)


def tailor_resume(
    resume_text: str, company: str, role: str, jd: str,
    gemini_key: Optional[str] = None,
) -> TailoredResume:
    llm = make_llm(gemini_key).with_structured_output(TailoredResume)
    return run_gemini(lambda: llm.invoke(f"""You are an expert resume writer.

Target: {role} at {company}

Job Description:
{jd[:6000]}

Candidate's ORIGINAL resume:
{resume_text[:8000]}

Rewrite the ENTIRE resume tailored to this job:
- Keep the same person, real experience, education, and real metrics — NEVER invent
  experience, employers, dates, or numbers.
- Reorder/reword to lead with what THIS job values; mirror the JD's language naturally.
- Keep it 1 page worth of content. Use strong action verbs and measurable outcomes.
- Sections in order: SUMMARY, TECHNICAL SKILLS, EXPERIENCE, PROJECTS, EDUCATION,
  then any others present in the original (certifications, achievements).
- contact_line: copy contact info from the original resume.
- changes: step-by-step list of every meaningful change and WHY it helps for this role.
"""), cap=30)
