"""Phase 3: Visa Sponsorship Signals

Run targeted Tavily searches for H-1B records, careers-page statements,
and job postings. Synthesize into evidence + confidence level.

New concepts:
- .search() with targeted queries (vs .research() for broad overviews)
- Honest uncertainty handling — evidence + confidence, never a guarantee

Run: uv run python phase3_sponsorship.py
"""

import os
from typing import List, Literal
from dotenv import load_dotenv
from pydantic import BaseModel, Field
from tavily import TavilyClient
from langchain_google_genai import ChatGoogleGenerativeAI

load_dotenv()

# ── Change this to any company ────────────────────────────────────────────────
COMPANY = "Anthropic"
# ─────────────────────────────────────────────────────────────────────────────


# ── Step 1: Define the output schema ─────────────────────────────────────────

class SponsorshipEvidence(BaseModel):
    evidence: str = Field(description="What was found — a quote or summary of the signal")
    source_url: str
    signal_type: Literal["H-1B filing record", "careers page statement", "job posting", "employee report", "news article"]

class SponsorshipSignals(BaseModel):
    company: str
    likely_sponsors: bool = Field(description="Best guess: does this company sponsor visas?")
    confidence: Literal["high", "medium", "low"]
    confidence_reason: str = Field(description="1 sentence explaining why confidence is high/medium/low")
    visa_types_mentioned: List[str] = Field(description="Visa types found in evidence: OPT, STEM OPT, H-1B, TN, etc.")
    evidence: List[SponsorshipEvidence] = Field(description="All individual signals found, each with source URL")
    disclaimer: str = Field(description="A short disclaimer that this is not a guarantee and the applicant should verify directly with the employer")


# ── Step 2: Run targeted searches ────────────────────────────────────────────
# .search() fires one query and returns a list of results — fast and precise.
# We run several targeted queries and pool all the results.

client = TavilyClient(api_key=os.getenv("TAVILY_API_KEY"))

queries = [
    f'"{COMPANY}" H-1B visa sponsorship filing records 2024 2025',
    f'"{COMPANY}" "visa sponsorship" OR "work authorization" site:myvisajobs.com OR site:h1bdata.info',
    f'"{COMPANY}" careers "visa sponsorship" OPT "STEM OPT" international students',
    f'"{COMPANY}" H-1B petitions sponsor international employees',
]

print(f"Running {len(queries)} targeted sponsorship searches for {COMPANY}...\n")

all_results = []
for query in queries:
    res = client.search(query=query, max_results=3, search_depth="advanced")
    hits = res.get("results", [])
    all_results.extend(hits)
    print(f"  {len(hits)} results — {query[:65]}...")

# Deduplicate by URL so we don't feed Gemini the same page twice
seen_urls = set()
unique_results = []
for r in all_results:
    if r["url"] not in seen_urls:
        seen_urls.add(r["url"])
        unique_results.append(r)

print(f"\n{len(unique_results)} unique sources collected.\n")


# ── Step 3: Format results for Gemini ────────────────────────────────────────

formatted_results = []
for i, r in enumerate(unique_results, 1):
    snippet = r.get("content", "")[:400]
    formatted_results.append(
        f"[{i}] {r.get('title', 'No title')}\n"
        f"    URL: {r['url']}\n"
        f"    {snippet}"
    )

search_text = "\n\n".join(formatted_results)


# ── Step 4: Ask Gemini to extract structured sponsorship signals ──────────────

print("Asking Gemini to analyze sponsorship signals...")

llm = ChatGoogleGenerativeAI(model="gemini-2.5-flash")
structured_llm = llm.with_structured_output(SponsorshipSignals)

prompt = f"""You are analyzing visa sponsorship signals for the company "{COMPANY}".

Below are search results from H-1B filing databases, job postings, careers pages,
and news. Extract structured sponsorship signals.

Rules:
- Only report what the evidence actually says — no speculation
- Confidence = high if multiple independent sources confirm sponsorship,
  medium if 1-2 sources suggest it, low if evidence is thin or conflicting
- Always include a disclaimer that this is not a guarantee

Search results:
{search_text}
"""

signals: SponsorshipSignals = structured_llm.invoke(prompt)


# ── Step 5: Print the result ──────────────────────────────────────────────────

print("\n" + "=" * 60)
print(f"SPONSORSHIP SIGNALS: {signals.company}")
print("=" * 60)
print(f"Likely sponsors:  {'Yes' if signals.likely_sponsors else 'No'}")
print(f"Confidence:       {signals.confidence.upper()}")
print(f"Reason:           {signals.confidence_reason}")
print(f"Visa types:       {', '.join(signals.visa_types_mentioned) if signals.visa_types_mentioned else 'None found'}")

print("\nEvidence:")
for ev in signals.evidence:
    print(f"  [{ev.signal_type}]")
    print(f"  {ev.evidence}")
    print(f"  {ev.source_url}\n")

print(f"DISCLAIMER: {signals.disclaimer}")

print("\nPhase 3 complete — targeted searches → sponsorship signals with confidence.")
