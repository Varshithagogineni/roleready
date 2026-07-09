"""Phase 7: Streamlit UI — the full job-application copilot as a web app.

FREE-TIER FRIENDLY VERSION.
Instead of a deep agent (which fires ~10 Gemini calls per run and blows the
free-tier rate limit), this uses a lean pipeline:
  Tavily does the web research (zero Gemini tokens) → ONE Gemini call builds
  the prep sheet → ONE Gemini call scores the resume. Just 2 chat calls/run.

Run: uv run streamlit run app.py
"""

import os
import tempfile
import pypdf
from dotenv import load_dotenv
from typing import List, Literal
from pydantic import BaseModel, Field
from langchain_google_genai import GoogleGenerativeAIEmbeddings, ChatGoogleGenerativeAI
from langchain_core.rate_limiters import InMemoryRateLimiter
from langchain_chroma import Chroma
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_core.documents import Document
from tavily import TavilyClient
import streamlit as st

load_dotenv()

# ── Model + rate limiting (the free-tier knobs) ──────────────────────────────
# gemini-2.5-flash-lite has the HIGHEST free-tier daily limit (~1000 requests/day)
# and its own separate quota bucket, so heavy testing on other models doesn't
# drain it. If you ever exhaust it, switch to another model name here — each
# model has its own separate daily free quota.
MODEL = "gemini-2.5-flash-lite"

# The rate limiter throttles Gemini calls so we never spike over the per-minute
# request limit. 0.2 req/sec = max ~12 requests/min, safely under the free cap.
_rate_limiter = InMemoryRateLimiter(
    requests_per_second=0.2,
    check_every_n_seconds=0.1,
    max_bucket_size=2,
)

def make_llm():
    """One place to build the LLM — model + rate limiter applied everywhere."""
    return ChatGoogleGenerativeAI(model=MODEL, rate_limiter=_rate_limiter)


# ── Pydantic schemas ─────────────────────────────────────────────────────────

class NewsItem(BaseModel):
    headline: str
    source_url: str

class SponsorshipEvidence(BaseModel):
    finding: str
    source_url: str

class InterviewQuestion(BaseModel):
    question: str = Field(description="An interview question actually reported by candidates for this company/role")
    source_url: str = Field(description="URL where this question was reported (Glassdoor, Blind, interview blog). Empty string only if no source.")
    tip: str = Field(description="1-line tip on how to approach this question")

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

class TailoredBullet(BaseModel):
    original: str
    tailored: str
    what_changed: str

class FitResult(BaseModel):
    fit_score: int
    score_breakdown: str
    strengths: List[str]
    gaps: List[str]
    tailored_summary: str
    tailored_bullets: List[TailoredBullet]
    remaining_gaps: List[str]


# ── Helper functions ──────────────────────────────────────────────────────────

def load_pdf_text(uploaded_file) -> str:
    """Read text from an uploaded PDF file."""
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        tmp.write(uploaded_file.read())
        tmp_path = tmp.name
    reader = pypdf.PdfReader(tmp_path)
    text = "\n".join(page.extract_text() or "" for page in reader.pages)
    os.unlink(tmp_path)
    return text


def index_resume(resume_text: str) -> Chroma:
    """Chunk, embed, and store the resume in a fresh in-memory Chroma collection.

    chunk_size=800 (bigger than before) → fewer chunks → fewer embedding calls,
    which also helps stay inside the free tier.
    """
    splitter = RecursiveCharacterTextSplitter(chunk_size=800, chunk_overlap=80)
    chunks = splitter.split_text(resume_text)
    docs = [Document(page_content=c, metadata={"chunk": i}) for i, c in enumerate(chunks)]
    embeddings = GoogleGenerativeAIEmbeddings(model="models/gemini-embedding-001")
    return Chroma.from_documents(documents=docs, embedding=embeddings)


def _search_blocks(client, queries: List[str], seen: set) -> List[str]:
    """Run each query, dedupe by URL, return formatted TITLE/URL/snippet blocks."""
    blocks = []
    for q in queries:
        res = client.search(query=q, max_results=4, search_depth="advanced")
        for r in res.get("results", []):
            if r["url"] in seen:
                continue
            seen.add(r["url"])
            snippet = (r.get("content") or "")[:400]
            blocks.append(f"TITLE: {r.get('title','')}\nURL: {r['url']}\n{snippet}")
    return blocks


def tavily_research(company: str, role: str) -> str:
    """Run targeted Tavily searches (NO Gemini tokens used here).

    Returns one text block with TWO clearly-labeled sections:
      - company / news / sponsorship sources
      - real interview-question sources (Glassdoor, Blind, interview blogs)
    """
    client = TavilyClient(api_key=os.getenv("TAVILY_API_KEY"))
    seen = set()

    company_blocks = _search_blocks(client, [
        f'{company} company overview what they do employees headquarters funding',
        f'{company} recent news 2026 launches funding partnerships',
        f'"{company}" H-1B visa sponsorship OPT STEM OPT international employees',
    ], seen)

    # Search for questions candidates ACTUALLY reported being asked — recent first.
    interview_blocks = _search_blocks(client, [
        f'{company} {role} interview questions Glassdoor',
        f'{company} {role} interview experience questions asked 2026',
        f'{company} {role} interview process what they ask',
    ], seen)

    return (
        "=== COMPANY & SPONSORSHIP SOURCES ===\n\n"
        + "\n\n---\n\n".join(company_blocks)
        + "\n\n\n=== REAL INTERVIEW-QUESTION SOURCES ===\n\n"
        + "\n\n---\n\n".join(interview_blocks)
    )


def build_prep_sheet(company: str, role: str, research_text: str) -> PrepSheet:
    """ONE Gemini call: turn raw search results into the full prep sheet."""
    structured_llm = make_llm().with_structured_output(PrepSheet)
    return structured_llm.invoke(f"""You are a job application research assistant for international students.

Company: {company}   Role: {role}

Below are web search results. Build a complete prep sheet from them:
1. Company overview — what they do, size, HQ, funding, 3-5 recent news items (with source URLs)
2. Visa sponsorship — H-1B / OPT / STEM OPT signals. Report ONLY what the evidence says.
   Confidence: high if multiple sources confirm, medium if 1-2, low if thin.
   Always include a disclaimer that this is not a guarantee.
3. Interview questions — from the "REAL INTERVIEW-QUESTION SOURCES" section, extract
   5-7 questions candidates ACTUALLY reported being asked for this company/role.
   Prefer the most recent. For each, include the source_url it came from. Do NOT
   invent questions — only use what the sources report. If sources are thin, return
   fewer real ones rather than making them up. Add a short prep tip for each.

Search results:
{research_text}
""")


def run_fit_score(vectorstore: Chroma, company: str, role: str, jd: str) -> FitResult:
    """ONE Gemini call: retrieve resume chunks + score fit + tailor bullets."""
    retriever = vectorstore.as_retriever(search_kwargs={"k": 6})
    chunks = retriever.invoke(f"{role} at {company}: {jd}")
    resume_context = "\n\n---\n\n".join(r.page_content for r in chunks)

    structured_llm = make_llm().with_structured_output(FitResult)
    return structured_llm.invoke(f"""You are an expert resume coach.

Company: {company}  |  Role: {role}

Job Description:
{jd}

Resume excerpts (most relevant):
{resume_context}

Score the fit honestly (0-100), list strengths and gaps, rewrite 5-7 bullets
for this specific company, and list gaps that can't be fixed by rewording.
Only reword/reframe — never invent experience.""")


# ── Streamlit UI ──────────────────────────────────────────────────────────────

st.set_page_config(page_title="RoleReady", page_icon="🎯", layout="wide")

# A little CSS polish: tighter top spacing + a hero banner + card styling.
# (Streamlit lets us inject raw CSS/HTML with unsafe_allow_html=True.)
st.markdown("""
<style>
.block-container {padding-top: 2.2rem;}
.hero {
  background: linear-gradient(120deg,#4f46e5,#7c3aed);
  padding: 1.4rem 1.8rem; border-radius: 16px; color: #fff; margin-bottom: 1.3rem;
}
.hero h1 {margin:0; font-size:1.9rem;}
.hero p {margin:.4rem 0 0; opacity:.92; font-size:1rem;}
.card {
  background: rgba(128,128,128,.08);
  border: 1px solid rgba(128,128,128,.20);
  border-radius: 14px; padding: 1.1rem 1.3rem; height: 100%;
}
.card .lbl {font-size:.72rem; text-transform:uppercase; letter-spacing:.06em; opacity:.65;}
.card .big {font-size:2.7rem; font-weight:700; line-height:1.05; margin-top:.2rem;}
.bar {height:9px; border-radius:6px; background:rgba(128,128,128,.22); overflow:hidden; margin-top:.7rem;}
.bar > span {display:block; height:100%;}
</style>
""", unsafe_allow_html=True)

st.markdown("""
<div class="hero">
  <h1>🎯 RoleReady</h1>
  <p>Get role-ready in one minute — company intel, visa-sponsorship signals, real interview questions & a resume tailored to the role.</p>
</div>
""", unsafe_allow_html=True)


def fit_color(score: int) -> str:
    return "#16a34a" if score >= 75 else "#d97706" if score >= 50 else "#dc2626"

def fit_label(score: int) -> str:
    return "Strong fit" if score >= 75 else "Moderate fit" if score >= 50 else "Needs work"


# ── Auth gate: require Google sign-in before showing the app ─────────────────
if not st.user.is_logged_in:
    _l, _c, _r = st.columns([1, 1.6, 1])
    with _c:
        st.markdown("### Welcome 👋")
        st.write("Sign in to research companies, check visa sponsorship, "
                 "and get a resume tailored to the role.")
        if st.button("🔐  Sign in with Google", type="primary", use_container_width=True):
            st.login()
        st.caption("We only use your Google name and email to set up your account.")
    st.stop()


with st.sidebar:
    st.markdown(f"**👤 {st.user.name}**")
    st.caption(st.user.email)
    if st.button("Log out", use_container_width=True):
        st.logout()
    st.divider()
    st.header("Your Application")
    company = st.text_input("Company name", placeholder="e.g. Anthropic")
    role    = st.text_input("Role", placeholder="e.g. ML Engineer")
    jd      = st.text_area("Job description (optional)", height=180,
                            placeholder="Paste the full JD for a sharper fit score...")
    resume_file = st.file_uploader("Your resume (PDF)", type=["pdf"])
    run_button = st.button("🚀 Prep me", type="primary", use_container_width=True)
    st.caption("Live web research + resume tailoring in ~1 minute.")

if run_button:
    if not company or not role:
        st.error("Please fill in the company name and role.")
        st.stop()
    if not resume_file:
        st.error("Please upload your resume PDF.")
        st.stop()

    try:
        with st.spinner("Reading your resume..."):
            resume_text = load_pdf_text(resume_file)
            vectorstore = index_resume(resume_text)

        with st.spinner(f"Researching {company} on the live web..."):
            research_text = tavily_research(company, role)

        with st.spinner("Building your prep sheet..."):
            prep = build_prep_sheet(company, role, research_text)

        with st.spinner("Scoring fit and tailoring your resume..."):
            jd_text = jd if jd.strip() else f"{role} role at {company}"
            fit = run_fit_score(vectorstore, company, role, jd_text)

        st.session_state["prep"] = prep
        st.session_state["fit"] = fit
        st.session_state["company"] = company
        st.session_state["role"] = role

    except Exception as e:
        if "RESOURCE_EXHAUSTED" in str(e) or "429" in str(e):
            st.error("⏳ Gemini free-tier limit hit for this minute. Wait ~60 seconds and try again.")
        else:
            st.error(f"Something went wrong: {e}")
        st.stop()

# ── Welcome / empty state (shown before the first run) ───────────────────────

if "prep" not in st.session_state:
    c1, c2, c3 = st.columns(3)
    with c1:
        st.markdown("#### 1 · Add the job")
        st.write("Enter a **company + role** in the sidebar. Paste the job description for the sharpest fit score.")
    with c2:
        st.markdown("#### 2 · Upload your resume")
        st.write("We read it **privately** — nothing is stored after your session ends.")
    with c3:
        st.markdown("#### 3 · Get your prep sheet")
        st.write("Company intel, visa signals, **real** interview questions, and a tailored resume.")
    st.info("👈 Fill in the sidebar and hit **Prep me** to start.")
    st.stop()

# ── Display results ───────────────────────────────────────────────────────────

prep: PrepSheet = st.session_state["prep"]
fit: FitResult  = st.session_state["fit"]
company = st.session_state["company"]
role    = st.session_state["role"]

st.subheader(f"{prep.company_name} · {role}")

# ── Three summary cards ──────────────────────────────────────────────────────
col1, col2, col3 = st.columns(3)
with col1:
    fc = fit_color(fit.fit_score)
    st.markdown(f"""
    <div class="card">
      <div class="lbl">Fit score</div>
      <div class="big" style="color:{fc}">{fit.fit_score}<span style="font-size:1.1rem;opacity:.6">/100</span></div>
      <div style="color:{fc};font-weight:600">{fit_label(fit.fit_score)}</div>
      <div class="bar"><span style="width:{fit.fit_score}%;background:{fc}"></span></div>
    </div>""", unsafe_allow_html=True)
with col2:
    sponsor = prep.likely_sponsors
    sc = "#16a34a" if sponsor else "#d97706"
    stext = "Likely Yes" if sponsor else "Unclear"
    st.markdown(f"""
    <div class="card">
      <div class="lbl">Visa sponsor</div>
      <div class="big" style="color:{sc};font-size:2.1rem">{stext}</div>
      <div style="opacity:.7;margin-top:.5rem">{prep.sponsorship_confidence.upper()} confidence</div>
    </div>""", unsafe_allow_html=True)
with col3:
    visas = ", ".join(prep.visa_types_mentioned) if prep.visa_types_mentioned else "—"
    st.markdown(f"""
    <div class="card">
      <div class="lbl">Visa types found</div>
      <div class="big" style="font-size:1.7rem;margin-top:.4rem">{visas}</div>
    </div>""", unsafe_allow_html=True)

st.write("")
tab1, tab2, tab3, tab4 = st.tabs(["🏢 Company", "🛂 Visa", "📄 Resume", "🎤 Interview"])

with tab1:
    st.subheader("Company Snapshot")
    c1, c2 = st.columns(2)
    c1.markdown(f"**What they do:** {prep.what_they_do}")
    c1.markdown(f"**Industry:** {prep.industry}")
    c1.markdown(f"**Employees:** {prep.employees}")
    c2.markdown(f"**HQ:** {prep.headquarters}")
    c2.markdown(f"**Funding:** {prep.funding_stage}")

    st.subheader("Recent News")
    for item in prep.recent_news:
        st.markdown(f"- [{item.headline}]({item.source_url})")

with tab2:
    if prep.likely_sponsors:
        st.success(f"✅ Likely sponsors — {prep.sponsorship_confidence.upper()} confidence")
    else:
        st.warning(f"⚠️ Sponsorship unclear — {prep.sponsorship_confidence.upper()} confidence")
    if prep.visa_types_mentioned:
        st.markdown(f"**Visa types found:** {', '.join(prep.visa_types_mentioned)}")

    st.subheader("Evidence")
    for ev in prep.sponsorship_evidence:
        with st.expander(ev.finding[:80] + "..."):
            st.markdown(ev.finding)
            st.markdown(f"[Source]({ev.source_url})")

    st.caption(f"⚠️ {prep.sponsorship_disclaimer}")

with tab3:
    st.info(fit.score_breakdown)

    c1, c2 = st.columns(2)
    with c1:
        st.markdown("##### ✅ Strengths")
        for s in fit.strengths:
            st.markdown(f"<div style='padding:.12rem 0'>✅ {s}</div>", unsafe_allow_html=True)
    with c2:
        st.markdown("##### 🔸 Gaps")
        for g in fit.gaps:
            st.markdown(f"<div style='padding:.12rem 0'>🔸 {g}</div>", unsafe_allow_html=True)

    st.subheader("Tailored Summary")
    st.markdown(f"*{fit.tailored_summary}*")

    st.subheader("Tailored Bullets")
    for b in fit.tailored_bullets:
        with st.expander(b.tailored[:90] + "..."):
            st.markdown(f"**Original:** {b.original}")
            st.markdown(f"**Tailored:** {b.tailored}")
            st.caption(f"🔄 {b.what_changed}")

    if fit.remaining_gaps:
        st.subheader("Remaining Gaps (can't be fixed by rewording)")
        for g in fit.remaining_gaps:
            st.markdown(f"• {g}")

with tab4:
    st.subheader("Interview Questions — actually reported by candidates")
    st.caption("Pulled from Glassdoor, interview-experience posts, and prep sites — with sources.")
    for i, q in enumerate(prep.interview_questions, 1):
        with st.expander(f"Q{i}: {q.question}"):
            st.caption(f"💡 Tip: {q.tip}")
            if q.source_url:
                st.markdown(f"[Reported here]({q.source_url})")
