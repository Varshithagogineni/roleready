"""RoleReady MCP server — exposes the job-application copilot as MCP tools.

Built on FastMCP 3.x (https://gofastmcp.com). Every tool is a thin wrapper over
the existing `backend.pipeline` functions, so the MCP surface stays in perfect
sync with the FastAPI app — same research, same free-tier discipline (Tavily does
the web work, Gemini only reasons), same Pydantic contract.

Run it (stdio — what Claude Desktop / Claude Code spawn):
    uv run fastmcp run backend/mcp_server.py

Or expose it over HTTP:
    uv run fastmcp run backend/mcp_server.py --transport http --port 8000

Keys: loaded from the project `.env` (TAVILY_API_KEY, GOOGLE_API_KEY). Because
MCP clients launch servers in an isolated environment, we load that .env by
absolute path below rather than relying on the caller's shell.
"""

import hashlib
import os
import sys
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv

# Make `import backend...` work no matter how this file is launched (`fastmcp run`
# only puts the script's own folder on sys.path, not the project root).
_PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(_PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(_PROJECT_ROOT))

# Load the project .env by absolute path BEFORE importing the pipeline (config.py
# reads the keys at import time). MCP clients don't inherit your shell env.
load_dotenv(_PROJECT_ROOT / ".env")

from fastmcp import FastMCP  # noqa: E402
from fastmcp.exceptions import ToolError  # noqa: E402

from backend import pipeline  # noqa: E402
from backend.schemas import (  # noqa: E402
    ChatReply,
    FitResult,
    JobPosting,
    PeopleResult,
    PrepBundle,
    TailoredResume,
)

# ── Identifying the caller ────────────────────────────────────────────────────
# The deployed server identifies each caller by a "connection code" they
# generate in the RoleReady web app while signed in. Claude sends it as
# `Authorization: Bearer <code>`; we hash it and look up whose it is.
#
# Enable with:  MCP_REQUIRE_AUTH=true   (local stdio dev leaves it off and uses
# the project .env, so development stays frictionless).
#
# Deliberately NOT OAuth. MCP clients expect to register themselves as an OAuth
# client on the fly, which Supabase Auth cannot do — Claude fails outright with
# "Incompatible auth server: does not support dynamic client registration". A
# Google OAuth proxy does work (see commit 4a2031a) and is the right answer for
# Claude Desktop, whose connector dialog only offers OAuth. Codes are the
# CLI-first step; Desktop support is planned separately.
#
# No FastMCP auth provider is installed, so the transport never returns a 401 —
# a 401 would make Claude start an OAuth flow, which is exactly what we are
# avoiding. An unknown code fails as a normal, readable tool error instead.

AUTH_ENABLED = os.getenv("MCP_REQUIRE_AUTH", "").strip().lower() in ("1", "true", "yes")
SUPABASE_URL = (os.getenv("SUPABASE_URL") or "").strip().rstrip("/")
# service_role: the caller has no Supabase session of their own, so RLS has
# nothing to act on and the lookup runs through a locked-down function instead.
# Never expose this beyond the server.
SUPABASE_SERVICE_KEY = (
    os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_KEY") or ""
).strip()


mcp = FastMCP(
    name="RoleReady",
    instructions=(
        "RoleReady is a job-application copilot for international students. Use it "
        "to research a company + role (what they do, funding, visa-sponsorship "
        "signals, real interview questions, people to network with), extract a job "
        "posting from a URL, score a resume's fit, and rewrite a resume tailored to "
        "the role. Sponsorship signals are evidence-based, never a guarantee — "
        "always tell the user to confirm with the employer."
    ),
)


# ── Per-user API keys (bring your own) ────────────────────────────────────────
# RoleReady runs on each user's OWN Gemini/Tavily keys. They paste them once in
# the web app, which stores them in Supabase (`user_api_keys`).
#
# The caller is identified by the connection code Claude sends. We only ever see
# the code, never a user id, so `keys_for_mcp_token` does the whole hop —
# hash -> user -> their keys — inside the database. It is SECURITY DEFINER and
# only service_role may execute it, so the service_role key never leaves this
# server and the lookup can't be reached from a browser.
#
# Local stdio dev has no code, so keys fall back to the project .env.

_CONNECT_HELP = (
    "This RoleReady connection needs your personal connection code. Open "
    "RoleReady in your browser, sign in, go to 'API keys' → 'Use RoleReady in "
    "Claude', generate a code, and reconnect with it."
)

_BAD_CODE_HELP = (
    "That connection code isn't valid — it may have been revoked or mistyped. "
    "Generate a new one in RoleReady under 'API keys' → 'Use RoleReady in Claude'."
)

_KEYS_HELP = (
    "No API keys saved for your account. Open RoleReady in your browser and "
    "paste your free Gemini and Tavily keys under 'API keys' "
    "(aistudio.google.com/apikey and app.tavily.com). They'll apply here too."
)


def _connection_code_hash() -> str:
    """SHA-256 of the connection code on this request. Raises if absent."""
    from fastmcp.server.dependencies import get_http_headers

    # FastMCP strips `authorization` by default so it can't be forwarded to
    # downstream services by accident. Opt that one header back in — not
    # include_all, which would hand every header to this code.
    headers = get_http_headers(include={"authorization"}) or {}
    raw = str(headers.get("authorization") or "").strip()
    code = raw[7:].strip() if raw.lower().startswith("bearer ") else ""
    if not code:
        raise ToolError(_CONNECT_HELP)
    return hashlib.sha256(code.encode("utf-8")).hexdigest()


def _user_keys() -> tuple[Optional[str], Optional[str]]:
    """Return (gemini_key, tavily_key) for the caller. (None, None) means
    'fall back to the server's .env', which only happens in local stdio dev."""
    if not AUTH_ENABLED:
        return None, None

    token_hash = _connection_code_hash()

    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        raise ToolError(
            "Server misconfigured: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are "
            "not set, so your saved API keys can't be looked up."
        )

    import httpx

    try:
        resp = httpx.post(
            f"{SUPABASE_URL}/rest/v1/rpc/keys_for_mcp_token",
            headers={
                "apikey": SUPABASE_SERVICE_KEY,
                "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                "Content-Type": "application/json",
            },
            json={"p_token_hash": token_hash},
            timeout=10.0,
        )
        resp.raise_for_status()
        rows = resp.json()
    except Exception as e:
        raise ToolError(f"Could not check your connection code: {str(e)[:200]}")

    # No row at all means the code matched nothing — never fall through to the
    # server's own keys, or a stranger could spend the owner's quota.
    if not rows:
        raise ToolError(_BAD_CODE_HELP)

    # A row with no keys means the code is fine but they never saved any keys.
    gemini = (rows[0].get("gemini_key") or "").strip() or None
    tavily = (rows[0].get("tavily_key") or "").strip() or None
    if not gemini and not tavily:
        raise ToolError(_KEYS_HELP)
    return gemini, tavily


# ── Helpers ───────────────────────────────────────────────────────────────────

def _resume_text(resume_path: Optional[str], resume_text: Optional[str]) -> str:
    """Resolve resume input to plain text. Accepts either a path to a .pdf/.txt/.md
    file or raw text pasted directly. Exactly one is required."""
    if resume_text and resume_text.strip():
        return resume_text
    if not resume_path:
        raise ToolError("Provide either `resume_path` (a .pdf/.txt file) or `resume_text`.")

    p = Path(resume_path).expanduser()
    if not p.is_file():
        raise ToolError(f"No file found at: {p}")

    if p.suffix.lower() == ".pdf":
        import pypdf
        try:
            reader = pypdf.PdfReader(str(p))
            text = "\n".join(page.extract_text() or "" for page in reader.pages)
        except Exception as e:
            raise ToolError(f"Could not read that PDF: {e}")
        if not text.strip():
            raise ToolError("That PDF has no extractable text (is it a scan?).")
        return text

    if p.suffix.lower() in (".txt", ".md"):
        return p.read_text(encoding="utf-8", errors="ignore")

    raise ToolError(
        f"Unsupported resume file type '{p.suffix}'. Use .pdf, .txt, or .md — "
        "or pass the text via `resume_text`."
    )


def _guard(fn, *args, **kwargs):
    """Run a pipeline call, converting internal errors into clean MCP tool errors."""
    try:
        return fn(*args, **kwargs)
    except pipeline.DailyQuotaError:
        raise ToolError(
            "Daily free Gemini quota is used up (resets midnight Pacific). "
            "Set your own GOOGLE_API_KEY, or try again tomorrow."
        )
    except ToolError:
        raise
    except Exception as e:
        msg = str(e)
        if "RESOURCE_EXHAUSTED" in msg or "429" in msg:
            raise ToolError("Hit the free-tier per-minute limit — wait ~30s and retry.")
        if "API key" in msg or "API_KEY_INVALID" in msg or "PERMISSION_DENIED" in msg:
            # Point people at whichever place their keys actually come from.
            raise ToolError(
                "One of your Gemini/Tavily API keys is invalid or expired. Open RoleReady "
                "in your browser and re-paste it under 'API keys'."
                if AUTH_ENABLED
                else "A Gemini/Tavily API key is missing or invalid (check the .env)."
            )
        raise ToolError(f"RoleReady failed: {msg[:300]}")


# ── Tools ─────────────────────────────────────────────────────────────────────

@mcp.tool
def check_api_keys() -> dict:
    """Check whether the Gemini and Tavily API keys are configured and actually valid.
    Costs ZERO Gemini quota (uses a models.list REST call). Returns each key's masked
    fingerprint, where it came from, and whether it works. Run this first if any other
    RoleReady tool fails with a key error.
    """
    def _report(raw: Optional[str], validator, missing_hint: str) -> dict:
        raw = (raw or "").strip()
        if not raw:
            return {"configured": False, "valid": False, "hint": missing_hint}
        return {
            "configured": True,
            "key_preview": f"{raw[:6]}…{raw[-4:]}",
            "valid": validator(raw),
        }

    if AUTH_ENABLED:
        try:
            gemini, tavily = _user_keys()
        except ToolError as e:
            return {"source": "your RoleReady account", "configured": False, "hint": str(e)}
        return {
            "source": "your RoleReady account (saved in RoleReady → API keys)",
            "gemini": _report(gemini, pipeline.validate_gemini_key, _KEYS_HELP),
            "tavily": _report(tavily, pipeline.validate_tavily_key, _KEYS_HELP),
        }

    return {
        "source": str(_PROJECT_ROOT / ".env"),
        "gemini": _report(os.getenv("GOOGLE_API_KEY"), pipeline.validate_gemini_key,
                          "Set GOOGLE_API_KEY in the project .env, or in your MCP client's env config."),
        "tavily": _report(os.getenv("TAVILY_API_KEY"), pipeline.validate_tavily_key,
                          "Set TAVILY_API_KEY in the project .env, or in your MCP client's env config."),
        "note": "Local mode — environment variables set by the MCP client take precedence over the .env file.",
    }


@mcp.tool
def research_company(company: str, role: str) -> PrepBundle:
    """Deep-research a company for a specific role and return a full prep bundle:
    company overview (what they do, size, HQ, funding, recent news), visa-sponsorship
    signals (H-1B / OPT / STEM OPT) with a confidence level and source links, 5-7 REAL
    reported interview questions, and up to 6 real people worth networking with.

    Every claim is grounded in live web sources. Sponsorship signals are evidence-based,
    never a guarantee. This is the flagship RoleReady tool — start here for any application.
    """
    gemini, tavily = _user_keys()
    return _guard(pipeline.prep_bundle, company, role, gemini, tavily)


@mcp.tool
def extract_job_posting(url: str) -> JobPosting:
    """Read a job-posting URL (LinkedIn, Greenhouse, Lever, company careers page, etc.)
    and extract the hiring company, the job title, and a cleaned plain-text job
    description. Use this first when the user pastes a job link, then feed the result
    into `research_company`, `score_resume_fit`, or `tailor_resume`.
    """
    gemini, tavily = _user_keys()
    return _guard(pipeline.extract_job_posting, url.strip(), gemini, tavily)


@mcp.tool
def find_people(company: str, role: str) -> PeopleResult:
    """Find up to 6 real, current employees at a company (recruiters, hiring managers,
    or people in/near the target role) from public LinkedIn profiles — each with a name,
    title, profile URL, and one line on why connecting helps. Use this for networking
    outreach. (`research_company` already includes people; use this for a people-only refresh.)
    """
    gemini, tavily = _user_keys()
    return _guard(pipeline.find_people, company, role, gemini, tavily)


@mcp.tool
def score_resume_fit(
    company: str,
    role: str,
    resume_path: Optional[str] = None,
    resume_text: Optional[str] = None,
    jd: str = "",
) -> FitResult:
    """Score how well a resume fits a role (0-100) with an honest breakdown: strengths,
    gaps, tailored rewrites of the 5-7 most relevant bullets, and gaps that can't be
    fixed by rewording. Never invents experience — only reframes what's there.

    Provide the resume as either `resume_path` (a .pdf/.txt/.md file) or `resume_text`.
    `jd` is the job description (optional but strongly improves accuracy — pass the
    `job_description` from `extract_job_posting`).
    """
    text = _resume_text(resume_path, resume_text)
    jd_text = jd.strip() or f"{role} role at {company}"
    gemini, _ = _user_keys()
    return _guard(pipeline.run_fit_score, text, company, role, jd_text, gemini)


@mcp.tool
def tailor_resume(
    company: str,
    role: str,
    resume_path: Optional[str] = None,
    resume_text: Optional[str] = None,
    jd: str = "",
) -> TailoredResume:
    """Rewrite an ENTIRE resume tailored to a specific role: reordered and reworded to
    lead with what this job values, mirroring the JD's language, in clean sections
    (SUMMARY, SKILLS, EXPERIENCE, PROJECTS, EDUCATION). Keeps the same real person,
    experience, and metrics — never fabricates. Also returns a step-by-step list of
    every change and why it helps.

    Provide the resume as either `resume_path` (a .pdf/.txt/.md file) or `resume_text`.
    Pass `jd` (the job description) for a much sharper rewrite.
    """
    text = _resume_text(resume_path, resume_text)
    jd_text = jd.strip() or f"{role} role at {company}"
    gemini, _ = _user_keys()
    return _guard(pipeline.tailor_resume, text, company, role, jd_text, gemini)


@mcp.tool
def ask_ray(
    company: str,
    role: str,
    question: str,
    context: str = "",
) -> ChatReply:
    """Ask Ray, RoleReady's grounded application coach, a question about a specific
    company/role. Factual lookups (company facts, visa/sponsorship) are answered from
    live web search with source links; coaching/personal questions ("how do I stand out?",
    "explain this gap") get a tailored answer. Pass any prior research summary as `context`
    to ground the reply.
    """
    messages = [{"role": "user", "content": question}]
    gemini, tavily = _user_keys()
    return _guard(pipeline.chat, company, role, context, messages, gemini, tavily)


if __name__ == "__main__":
    mcp.run()  # stdio transport by default — what Claude Desktop / Claude Code spawn
