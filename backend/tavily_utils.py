"""Tavily helpers — all web research (0 Gemini tokens). Searches run in parallel;
`tavily_answer` returns a directly-synthesized answer for factual questions."""

import re
from concurrent.futures import ThreadPoolExecutor
from typing import List

from tavily import TavilyClient

from backend.schemas import ChatSource


def _format_result(r: dict) -> str:
    return f"TITLE: {r.get('title', '')}\nURL: {r['url']}\n{(r.get('content') or '')[:400]}"


def parallel_search(client: TavilyClient, queries: List[str], max_results: int = 3) -> List[str]:
    """Run all queries concurrently, then dedupe by URL (deterministic order)."""
    def one(q: str) -> List[dict]:
        try:
            return client.search(query=q, max_results=max_results, search_depth="advanced").get("results", [])
        except Exception:
            return []

    with ThreadPoolExecutor(max_workers=min(9, max(1, len(queries)))) as ex:
        lists = list(ex.map(one, queries))

    seen: set = set()
    blocks: List[str] = []
    for lst in lists:
        for r in lst:
            if r["url"] in seen:
                continue
            seen.add(r["url"])
            blocks.append(_format_result(r))
    return blocks


def tavily_answer(client: TavilyClient, company: str, role: str, question: str):
    """Direct synthesized answer from Tavily (0 Gemini) + source chips."""
    q = f"{company} ({role} role): {question}"
    res = client.search(query=q, include_answer="advanced", max_results=4, search_depth="basic")
    answer = (res.get("answer") or "").strip()
    if not answer:
        raise ValueError("no answer")
    if re.search(r"\b(visa|sponsor|h-?1b|opt|cpt|green ?card|work authoriz)", question, re.I):
        answer += ("\n\n⚠️ Based on public data, not a guarantee — always confirm "
                   "sponsorship directly with the employer.")
    sources = [
        ChatSource(title=r.get("title", "") or r["url"], url=r["url"])
        for r in res.get("results", [])
    ]
    return answer, sources
