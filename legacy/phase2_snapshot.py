"""Phase 2: Structured Snapshot — turn raw research into clean typed data.

Feed the Phase 1 report into Gemini with a Pydantic schema.
Gemini fills in each field; we get a clean Python object back.

Run: uv run python phase2_snapshot.py
"""

import os
from typing import List
from dotenv import load_dotenv
from pydantic import BaseModel, Field
from langchain_google_genai import ChatGoogleGenerativeAI
from phase1_research import research_company

load_dotenv()

# ── Change this to any company ────────────────────────────────────────────────
COMPANY = "Anthropic"
# ─────────────────────────────────────────────────────────────────────────────


# ── Step 1: Define the shape of data we want ─────────────────────────────────
# Pydantic: a Python class where every field has a type and an optional
# description that tells Gemini what to put there.

class NewsItem(BaseModel):
    headline: str
    source_url: str

class CompanySnapshot(BaseModel):
    name: str
    what_they_do: str = Field(description="1-2 sentence summary of core business and mission")
    industry: str
    employees: str = Field(description="Employee count or estimate, e.g. '~2,300' or '500-1,000'")
    headquarters: str
    funding_stage: str = Field(description="Latest funding round + valuation, e.g. 'Series H, $965B valuation (May 2026)'")
    recent_news: List[NewsItem] = Field(description="3-5 most important recent news items with source URLs")


# ── Step 2: Get the raw research from Phase 1 ────────────────────────────────

raw = research_company(COMPANY)
content = raw["content"]


# ── Step 3: Ask Gemini to extract structured data ────────────────────────────
# with_structured_output() tells LangChain: don't reply in free text —
# fill in the CompanySnapshot schema exactly.

print("\nAsking Gemini to structure the data...")

llm = ChatGoogleGenerativeAI(model="gemini-2.5-flash")
structured_llm = llm.with_structured_output(CompanySnapshot)

snapshot: CompanySnapshot = structured_llm.invoke(
    f"Extract structured company information from this research report:\n\n{content}"
)


# ── Step 4: Print the clean result ───────────────────────────────────────────

print("\n" + "=" * 60)
print(f"COMPANY SNAPSHOT: {snapshot.name}")
print("=" * 60)
print(f"What they do:  {snapshot.what_they_do}")
print(f"Industry:      {snapshot.industry}")
print(f"Employees:     {snapshot.employees}")
print(f"HQ:            {snapshot.headquarters}")
print(f"Funding:       {snapshot.funding_stage}")
print("\nRecent News:")
for item in snapshot.recent_news:
    print(f"  - {item.headline}")
    print(f"    {item.source_url}")

print("\nPhase 2 complete — raw research → clean structured snapshot.")
