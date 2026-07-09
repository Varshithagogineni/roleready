"""RoleReady API server.

Dev:   uv run uvicorn backend.server:app --reload --port 8000
Prod:  uv run uvicorn backend.server:app --port 8000  (no --reload)

Auth-free API; users may supply their own keys via headers:
  X-Gemini-Key  — their Google AI Studio key
  X-Tavily-Key  — their Tavily key
Absent headers fall back to the server's .env keys.
"""

import io
import os
from typing import Optional

import pypdf
from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from backend import pipeline

app = FastAPI(title="RoleReady API", version="1.0.0")

# Allowed origins come from env (comma-separated) so prod can add its domain.
# Defaults cover local dev.
_default_origins = "http://localhost:5173,http://127.0.0.1:5173"
ALLOWED_ORIGINS = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", _default_origins).split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _pdf_to_text(data: bytes) -> str:
    try:
        reader = pypdf.PdfReader(io.BytesIO(data))
        text = "\n".join(page.extract_text() or "" for page in reader.pages)
    except Exception:
        raise HTTPException(400, "Could not read that PDF. Please upload a valid resume PDF.")
    if not text.strip():
        raise HTTPException(400, "That PDF has no extractable text (is it a scan?).")
    return text


def _friendly(e: Exception) -> HTTPException:
    if isinstance(e, pipeline.DailyQuotaError):
        return HTTPException(429, "Daily free quota is used up (resets midnight Pacific). Add your own API key in Settings to keep going.")
    msg = str(e)
    if "RESOURCE_EXHAUSTED" in msg or "429" in msg:
        if "PerDay" in msg:
            return HTTPException(429, "Daily free quota is used up (resets midnight Pacific). Add your own API key in Settings.")
        return HTTPException(429, "Busy for a moment (free-tier per-minute limit). Wait ~30 seconds and try again, or add your own API key in Settings.")
    if "503" in msg or "UNAVAILABLE" in msg or "high demand" in msg or "overloaded" in msg.lower():
        return HTTPException(503, "Gemini is briefly overloaded (high demand — not your quota). Give it a few seconds and try again.")
    if "API key" in msg or "PERMISSION_DENIED" in msg or "API_KEY_INVALID" in msg:
        return HTTPException(401, "An API key is missing or invalid. Check Settings.")
    return HTTPException(500, f"Something went wrong: {msg[:300]}")


class CompanyRole(BaseModel):
    company: str
    role: str


class JobUrl(BaseModel):
    url: str


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    company: str
    role: str
    context: str = ""
    messages: list[ChatMessage]


# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/validate-keys")
def validate_keys(
    x_gemini_key: Optional[str] = Header(None),
    x_tavily_key: Optional[str] = Header(None),
):
    """Cheap sanity check for user-provided keys."""
    result = {"gemini": None, "tavily": None}
    if x_gemini_key:
        # models.list REST call — costs NO generate-request quota.
        result["gemini"] = pipeline.validate_gemini_key(x_gemini_key)
    if x_tavily_key:
        result["tavily"] = pipeline.validate_tavily_key(x_tavily_key)
    return result


@app.post("/api/extract-job", response_model=pipeline.JobPosting)
def extract_job(
    body: JobUrl,
    x_gemini_key: Optional[str] = Header(None),
    x_tavily_key: Optional[str] = Header(None),
):
    try:
        return pipeline.extract_job_posting(body.url.strip(), x_gemini_key, x_tavily_key)
    except ValueError as e:
        raise HTTPException(422, str(e))
    except Exception as e:
        raise _friendly(e)


@app.post("/api/prep-bundle", response_model=pipeline.PrepBundle)
def prep_bundle(
    body: CompanyRole,
    x_gemini_key: Optional[str] = Header(None),
    x_tavily_key: Optional[str] = Header(None),
):
    """Company research + people in ONE Gemini call (free-tier friendly)."""
    try:
        return pipeline.prep_bundle(body.company, body.role, x_gemini_key, x_tavily_key)
    except HTTPException:
        raise
    except Exception as e:
        raise _friendly(e)


@app.post("/api/fit-score", response_model=pipeline.FitResult)
def fit_score(
    company: str = Form(...),
    role: str = Form(...),
    jd: str = Form(""),
    resume: UploadFile = File(...),
    x_gemini_key: Optional[str] = Header(None),
):
    resume_text = _pdf_to_text(resume.file.read())
    jd_text = jd.strip() or f"{role} role at {company}"
    try:
        return pipeline.run_fit_score(resume_text, company, role, jd_text, x_gemini_key)
    except Exception as e:
        raise _friendly(e)


@app.post("/api/people", response_model=pipeline.PeopleResult)
def people(
    body: CompanyRole,
    x_gemini_key: Optional[str] = Header(None),
    x_tavily_key: Optional[str] = Header(None),
):
    try:
        return pipeline.find_people(body.company, body.role, x_gemini_key, x_tavily_key)
    except Exception as e:
        raise _friendly(e)


@app.post("/api/chat", response_model=pipeline.ChatReply)
def chat(
    body: ChatRequest,
    x_gemini_key: Optional[str] = Header(None),
    x_tavily_key: Optional[str] = Header(None),
):
    try:
        return pipeline.chat(
            body.company,
            body.role,
            body.context,
            [m.model_dump() for m in body.messages],
            x_gemini_key,
            x_tavily_key,
        )
    except Exception as e:
        raise _friendly(e)


@app.post("/api/tailor-resume", response_model=pipeline.TailoredResume)
def tailor(
    company: str = Form(...),
    role: str = Form(...),
    jd: str = Form(""),
    resume: UploadFile = File(...),
    x_gemini_key: Optional[str] = Header(None),
):
    resume_text = _pdf_to_text(resume.file.read())
    jd_text = jd.strip() or f"{role} role at {company}"
    try:
        return pipeline.tailor_resume(resume_text, company, role, jd_text, x_gemini_key)
    except Exception as e:
        raise _friendly(e)
