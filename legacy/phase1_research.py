"""Phase 1: Company research using Tavily's research endpoint.

Given a company name, produces a research report — what they do,
size, recent news, hiring — with cited source URLs.

Run: uv run python phase1_research.py
"""

import os
import time
from dotenv import load_dotenv
from tavily import TavilyClient

load_dotenv()

# ── Change this to any company you want to research ──────────────────────────
COMPANY = "Anthropic"
# ─────────────────────────────────────────────────────────────────────────────


def research_company(company_name: str) -> dict:
    client = TavilyClient(api_key=os.getenv("TAVILY_API_KEY"))

    print(f"Researching {company_name}...")
    print("(Takes ~30-60 seconds — Tavily runs multiple searches behind the scenes)\n")

    # Start the research job (async — returns immediately with a request_id)
    job = client.research(
        input=(
            f'Research the company "{company_name}":\n'
            "- What do they do? Industry, products/services, mission.\n"
            "- Company size (employees), headquarters, funding stage.\n"
            "- Recent news (last 6 months): launches, funding, partnerships, layoffs.\n"
            "- Any open roles or recent hiring activity.\n"
        ),
        model="mini",  # 'mini' uses fewer credits; 'pro' goes deeper
    )

    # Poll until the report is ready
    request_id = job["request_id"]
    result = None
    for attempt in range(30):  # max ~90 seconds
        time.sleep(3)
        result = client.get_research(request_id)
        status = result.get("status", "")
        print(f"  Status: {status} (attempt {attempt + 1})")
        if status == "completed":
            break

    if not result or result.get("status") != "completed":
        raise RuntimeError("Research job did not complete in time.")

    # ── Print the report ──────────────────────────────────────────────────────
    print("\n" + "=" * 60)
    print(f"RESEARCH REPORT: {company_name}")
    print("=" * 60)
    print(result.get("content", "No report returned."))

    # ── Print the sources ─────────────────────────────────────────────────────
    sources = result.get("sources", [])
    if sources:
        print("\n" + "=" * 60)
        print("SOURCES")
        print("=" * 60)
        for i, source in enumerate(sources, 1):
            print(f"[{i}] {source.get('title', 'No title')}")
            print(f"     {source.get('url', '')}")

    return result


if __name__ == "__main__":
    research_company(COMPANY)
