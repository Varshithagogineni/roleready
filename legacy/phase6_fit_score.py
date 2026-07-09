"""Phase 6: Fit Score + Tailored Resume

Load the indexed resume from Chroma, retrieve the most relevant chunks
for the target role, then ask Gemini to:
  1. Score the fit (0-100) with a breakdown
  2. Identify strengths and gaps
  3. Rewrite resume bullets optimized for this company/role
  4. List what changed and why + remaining gaps (honest)

New concepts:
- Loading an existing Chroma collection (don't re-embed every time)
- Combining RAG retrieval + structured output in one pipeline
- Controlled generation: rewrite with constraints ("keep it truthful, cite evidence")

Run: uv run python phase6_fit_score.py
"""

import os
from typing import List
from dotenv import load_dotenv
from pydantic import BaseModel, Field
from langchain_google_genai import GoogleGenerativeAIEmbeddings, ChatGoogleGenerativeAI
from langchain_chroma import Chroma

load_dotenv()

# ── Change these to match your target application ─────────────────────────────
COMPANY = "Anthropic"
ROLE = "ML Engineer"

JD = """
About the role:
We're hiring ML Engineers to work on deploying and serving Claude models at scale,
building inference infrastructure, and developing tools that make researchers and
engineers more productive.

Requirements:
- Strong Python engineering; TypeScript a plus
- Experience deploying and serving ML/LLM models in production (latency, cost, reliability)
- Distributed systems and cloud infrastructure experience (AWS preferred)
- Vector databases, embeddings, and retrieval pipelines (RAG)
- Familiarity with LangChain or similar LLM frameworks
- Solid fundamentals in data structures, algorithms, system design
- MS or PhD in CS, ML, or related field preferred

Nice to have:
- AI safety research interest or background
- Constitutional AI / RLHF familiarity
- Experience building developer-facing tools (engineers as primary users)
- Voice AI or multimodal experience
"""
# ─────────────────────────────────────────────────────────────────────────────


# ── Step 1: Define the output schema ─────────────────────────────────────────

class TailoredBullet(BaseModel):
    original: str = Field(description="The original resume bullet, verbatim")
    tailored: str = Field(description="The rewritten bullet, optimized for this company and role")
    what_changed: str = Field(description="1 sentence: what was changed and why")

class FitResult(BaseModel):
    fit_score: int = Field(description="0-100: how well this resume matches the role right now")
    score_breakdown: str = Field(description="2-3 sentences explaining the score — be honest, not flattering")
    strengths: List[str] = Field(description="Top 3-5 resume strengths that directly match the JD")
    gaps: List[str] = Field(description="Top 3-5 gaps — what the JD needs that the resume lacks or is weak on")
    tailored_summary: str = Field(description="Rewritten resume summary, 3-4 sentences, optimized for this company and role")
    tailored_bullets: List[TailoredBullet] = Field(description="The 5-7 most relevant bullets rewritten for this role")
    remaining_gaps: List[str] = Field(description="Gaps that cannot be fixed by rewording — skills genuinely missing. Be honest.")


# ── Step 2: Load Chroma (reuse what Phase 5 already indexed) ─────────────────
# We don't re-embed — we just open the existing ./chroma_db/ collection.

embeddings = GoogleGenerativeAIEmbeddings(model="models/gemini-embedding-001")

vectorstore = Chroma(
    persist_directory="./chroma_db",
    embedding_function=embeddings,
    collection_name="resume",
)

print(f"Loaded Chroma: {vectorstore._collection.count()} chunks indexed")


# ── Step 3: Retrieve the most relevant resume chunks for this JD ──────────────
# We query with the role + JD requirements so we pull the chunks that
# are most likely to help score and tailor.

retriever = vectorstore.as_retriever(search_kwargs={"k": 8})
query = f"{ROLE} at {COMPANY}: {JD}"
relevant_chunks = retriever.invoke(query)

resume_context = "\n\n---\n\n".join(r.page_content for r in relevant_chunks)

print(f"Retrieved {len(relevant_chunks)} relevant resume chunks\n")


# ── Step 4: Ask Gemini to score and tailor ───────────────────────────────────

print("Asking Gemini to score fit and tailor the resume...")

llm = ChatGoogleGenerativeAI(model="gemini-2.5-flash")
structured_llm = llm.with_structured_output(FitResult)

prompt = f"""You are an expert resume coach and hiring consultant.

Company: {COMPANY}
Role: {ROLE}

Job Description:
{JD}

Resume excerpts (most relevant sections):
{resume_context}

Your task:
1. Score the fit honestly (0-100). Do not inflate — a realistic score is more useful.
2. List the top strengths (what maps well) and gaps (what's missing or weak).
3. Rewrite the 5-7 most relevant bullets to emphasize what THIS company cares about.
   - Keep everything truthful — only reword/reframe, never invent experience
   - Use the company's language from the JD where natural
   - Lead with the most impressive metric or outcome
4. List remaining gaps — things genuinely absent from the resume that can't be fixed by rewording.

Be specific to {COMPANY}'s values and this role, not generic career advice.
"""

result: FitResult = structured_llm.invoke(prompt)


# ── Step 5: Print the full output ────────────────────────────────────────────

print("\n" + "=" * 60)
print(f"FIT SCORE: {result.fit_score}/100  —  {ROLE} at {COMPANY}")
print("=" * 60)

print(f"\n{result.score_breakdown}")

print("\nSTRENGTHS:")
for s in result.strengths:
    print(f"  ✓ {s}")

print("\nGAPS:")
for g in result.gaps:
    print(f"  ✗ {g}")

print("\n" + "-" * 60)
print("TAILORED SUMMARY:")
print("-" * 60)
print(result.tailored_summary)

print("\n" + "-" * 60)
print("TAILORED BULLETS (with explanations):")
print("-" * 60)
for i, b in enumerate(result.tailored_bullets, 1):
    print(f"\n[{i}] ORIGINAL:  {b.original}")
    print(f"    TAILORED:  {b.tailored}")
    print(f"    CHANGED:   {b.what_changed}")

print("\n" + "-" * 60)
print("REMAINING GAPS (can't be fixed by rewording):")
print("-" * 60)
for g in result.remaining_gaps:
    print(f"  • {g}")

print("\n" + "=" * 60)
print("Phase 6 complete — fit score + tailored resume generated.")
print("=" * 60)
