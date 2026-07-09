"""Company research features: job-link extraction, the merged prep bundle
(company intel + visa signals + interview questions + people), and the
standalone prep-sheet / people functions used as fallbacks."""

import time
from typing import Optional

from backend.config import DailyQuotaError, make_llm, run_gemini, tavily_client
from backend.schemas import JobPosting, PeopleResult, PrepBundle, PrepSheet
from backend.tavily_utils import parallel_search


# ── Job-link extraction (1 Gemini call) ──────────────────────────────────────

def extract_job_posting(
    url: str,
    gemini_key: Optional[str] = None, tavily_key: Optional[str] = None,
) -> JobPosting:
    client = tavily_client(tavily_key)
    res = client.extract(urls=[url])
    results = res.get("results", [])
    content = (results[0].get("raw_content") or "") if results else ""

    if not content.strip():
        search = client.search(query=url, max_results=3, search_depth="advanced")
        content = "\n\n".join((r.get("content") or "") for r in search.get("results", []))

    if not content.strip():
        raise ValueError(
            "Couldn't read that job posting (the site may require login). "
            "Try a public posting link, or fill the fields manually."
        )

    llm = make_llm(gemini_key).with_structured_output(JobPosting)
    return run_gemini(lambda: llm.invoke(f"""Below is the raw text of a job posting page.

Extract:
- company: the hiring company's name
- role: the job title
- job_description: the actual job description (role, responsibilities, requirements,
  qualifications) as clean plain text. Remove navigation, cookie banners, unrelated links.

Page text:
{content[:10000]}
"""), cap=10)


# ── Merged prep bundle: prep sheet + people in ONE Gemini call ───────────────

_bundle_cache: dict[tuple, tuple] = {}   # (company, role) -> (timestamp, PrepBundle)
_BUNDLE_TTL = 1800                        # 30 min — cuts repeat-prep quota during testing


def prep_bundle(
    company: str, role: str,
    gemini_key: Optional[str] = None, tavily_key: Optional[str] = None,
) -> PrepBundle:
    cache_key = (company.strip().lower(), role.strip().lower())
    hit = _bundle_cache.get(cache_key)
    if hit and (time.time() - hit[0]) < _BUNDLE_TTL:
        return hit[1]

    client = tavily_client(tavily_key)

    # All 9 searches run in parallel (Tavily), in the wall-time of the slowest one.
    research_blocks = parallel_search(client, [
        f"{company} company overview what they do employees headquarters funding",
        f"{company} recent news launches funding partnerships",
        f'"{company}" H-1B visa sponsorship OPT STEM OPT international employees',
        f"{company} {role} interview questions Glassdoor",
        f"{company} {role} interview experience questions asked",
        f"{company} {role} interview process what they ask",
    ])
    people_blocks = parallel_search(client, [
        f'site:linkedin.com/in "{company}" {role}',
        f'site:linkedin.com/in "{company}" recruiter OR "talent acquisition"',
        f'"{company}" {role} engineer linkedin profile',
    ])

    prompt = f"""You are a job-application research assistant for international students.

Company: {company}   Role: {role}

Produce BOTH of the following from the sources below:

A) prep_sheet:
   1. Company overview — what they do, size, HQ, funding, 3-5 recent news items (with source URLs).
   2. Visa sponsorship — H-1B / OPT / STEM OPT signals. Report ONLY what evidence shows.
      Confidence: high if multiple sources confirm, medium if 1-2, low if thin.
      Always include a disclaimer that this is not a guarantee.
   3. Interview questions — 5-7 questions candidates ACTUALLY reported, each with its
      source_url. Do NOT invent questions; fewer real ones beat made-up ones.

B) people: up to 6 REAL current employees at {company} (recruiters, hiring managers, or people
   in/near the "{role}" role) from the LinkedIn results. For each: name, title, the profile URL
   from the sources, 1 sentence on why connecting helps. Do NOT invent people or URLs. Add an
   honesty note that the list comes from public profiles.

=== COMPANY / SPONSORSHIP / INTERVIEW SOURCES ===
{chr(10).join(research_blocks)}

=== LINKEDIN / PEOPLE SOURCES ===
{chr(10).join(people_blocks)}
"""

    llm = make_llm(gemini_key).with_structured_output(PrepBundle)
    try:
        result = run_gemini(lambda: llm.invoke(prompt), cap=30)
    except DailyQuotaError:
        raise
    except Exception:
        # Rare: combined schema failed. Fall back to two separate calls.
        result = PrepBundle(
            prep_sheet=build_prep_sheet(company, role, gemini_key, tavily_key),
            people=find_people(company, role, gemini_key, tavily_key),
        )

    _bundle_cache[cache_key] = (time.time(), result)
    return result


# ── Standalone prep sheet (fallback) ─────────────────────────────────────────

def build_prep_sheet(
    company: str, role: str,
    gemini_key: Optional[str] = None, tavily_key: Optional[str] = None,
) -> PrepSheet:
    client = tavily_client(tavily_key)
    blocks = parallel_search(client, [
        f"{company} company overview what they do employees headquarters funding",
        f"{company} recent news launches funding partnerships",
        f'"{company}" H-1B visa sponsorship OPT STEM OPT international employees',
        f"{company} {role} interview questions Glassdoor",
        f"{company} {role} interview experience questions asked",
    ])
    llm = make_llm(gemini_key).with_structured_output(PrepSheet)
    return run_gemini(lambda: llm.invoke(f"""You are a job application research assistant for international students.

Company: {company}   Role: {role}

Build a complete prep sheet from these web results: company overview (size, HQ, funding),
3-5 recent news items with URLs; visa sponsorship signals (H-1B/OPT/STEM OPT) with confidence
and a not-a-guarantee disclaimer; 5-7 REAL reported interview questions with source_urls.

Sources:
{chr(10).join(blocks)}
"""), cap=30)


# ── Standalone people (fallback) ─────────────────────────────────────────────

def find_people(
    company: str, role: str,
    gemini_key: Optional[str] = None, tavily_key: Optional[str] = None,
) -> PeopleResult:
    client = tavily_client(tavily_key)
    blocks = parallel_search(client, [
        f'site:linkedin.com/in "{company}" {role}',
        f'site:linkedin.com/in "{company}" recruiter OR "talent acquisition"',
        f'"{company}" {role} engineer linkedin profile',
    ])
    llm = make_llm(gemini_key).with_structured_output(PeopleResult)
    return run_gemini(lambda: llm.invoke(f"""You are helping a job applicant find people to network with.

Company: {company}   Target role: {role}

From these public LinkedIn results, extract up to 6 REAL current employees (recruiters, hiring
managers, or people in/near the "{role}" role). For each: name, title, the profile URL from the
sources, 1 sentence on why connecting helps. Do NOT invent people or URLs. Add an honesty note.

Sources:
{chr(10).join(blocks)}
"""), cap=30)
