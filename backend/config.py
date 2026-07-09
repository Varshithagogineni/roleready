"""Core infrastructure: API keys, the Gemini client, rate limiting, and the
retry engine. Everything here is provider plumbing — no business logic.

Free-tier discipline: every Gemini call goes through `run_gemini`, which holds a
global semaphore (one call in flight) and a per-key token-bucket limiter, and
retries transient 429/503 while surfacing per-day quota as `DailyQuotaError`.
"""

import os
import re
import threading
import time
from typing import Optional

from dotenv import load_dotenv
from langchain_core.rate_limiters import InMemoryRateLimiter
from langchain_google_genai import ChatGoogleGenerativeAI
from tavily import TavilyClient

load_dotenv()

# gemini-2.5-flash-lite free tier: ~15 RPM, ~250k TPM, ~1000 RPD (per project).
MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash-lite")

# One limiter PER API key (quota is per project). rps=0.15 + bucket=1 → a single
# Gemini call starts at most every ~6.7s (≈9 RPM sustained, headroom under 15).
_limiters: dict[str, InMemoryRateLimiter] = {}
_limiters_lock = threading.Lock()

# Global semaphore: at most ONE Gemini call in flight at any moment, across all
# concurrent FastAPI requests. The limiter spaces *starts*; the semaphore caps
# *in-flight* — together they guarantee we never spike past the RPM.
_gemini_semaphore = threading.Semaphore(1)


class DailyQuotaError(Exception):
    """Raised when the per-DAY free quota is exhausted (retrying can't help)."""


def _limiter_for(key: str) -> InMemoryRateLimiter:
    with _limiters_lock:
        lim = _limiters.get(key)
        if lim is None:
            lim = InMemoryRateLimiter(
                requests_per_second=0.15, check_every_n_seconds=0.1, max_bucket_size=1
            )
            _limiters[key] = lim
        return lim


def gemini_key(user_key: Optional[str]) -> str:
    key = (user_key or "").strip() or os.getenv("GOOGLE_API_KEY", "")
    if not key:
        raise ValueError("No Gemini API key available.")
    return key


def tavily_client(user_key: Optional[str]) -> TavilyClient:
    key = (user_key or "").strip() or os.getenv("TAVILY_API_KEY", "")
    if not key:
        raise ValueError("No Tavily API key available.")
    return TavilyClient(api_key=key)


def make_llm(user_key: Optional[str] = None) -> ChatGoogleGenerativeAI:
    key = gemini_key(user_key)
    return ChatGoogleGenerativeAI(
        model=MODEL,
        google_api_key=key,
        rate_limiter=_limiter_for(key),
        max_retries=0,  # we own retries (SDK retries would bypass our limiter)
    )


def _is_429(e: Exception) -> bool:
    s = str(e)
    return "RESOURCE_EXHAUSTED" in s or "429" in s


def _is_transient(e: Exception) -> bool:
    """Server-side overload/hiccup (NOT quota) — retrying usually works."""
    s = str(e)
    return (
        "503" in s or "UNAVAILABLE" in s or "500 INTERNAL" in s
        or "high demand" in s.lower() or "overloaded" in s.lower()
    )


def _is_per_day(e: Exception) -> bool:
    return "PerDay" in str(e)


def _retry_delay(e: Exception, default: int = 8) -> int:
    m = re.search(r"retryDelay['\"]?\s*[:=]\s*['\"]?(\d+)", str(e))
    return int(m.group(1)) if m else default


def run_gemini(thunk, *, cap: int = 30, attempts: int = 3):
    """Run a Gemini call under the global semaphore, retrying transient errors.

    - Only ONE call holds the semaphore at a time, but the retry sleep happens
      OUTSIDE the semaphore so a backing-off call doesn't freeze the whole app.
    - 429 per-minute → sleep the server-suggested delay (capped) and retry.
    - 503 / overload → short backoff and retry.
    - Per-day quota → raise DailyQuotaError immediately (retrying can't help)."""
    last_err: Optional[Exception] = None
    for i in range(attempts):
        delay = 0
        with _gemini_semaphore:
            try:
                return thunk()
            except DailyQuotaError:
                raise
            except Exception as e:
                if _is_429(e):
                    if _is_per_day(e):
                        raise DailyQuotaError() from e
                    delay = min(_retry_delay(e), cap)  # per-minute: obey suggested delay
                elif _is_transient(e):
                    delay = min(4 * (i + 1), cap)       # 503/overload: short backoff
                else:
                    raise
                last_err = e
        if i < attempts - 1:
            time.sleep(delay)  # semaphore released — others can proceed
    raise last_err  # type: ignore[misc]


# ── Key validation (ZERO generate quota) ─────────────────────────────────────

def validate_gemini_key(key: str) -> bool:
    """List models via REST — costs no generate-request quota."""
    import json
    import urllib.request
    try:
        req = urllib.request.Request(
            f"https://generativelanguage.googleapis.com/v1beta/models?key={key.strip()}"
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.load(resp)
            return "models" in data
    except Exception:
        return False


def validate_tavily_key(key: str) -> bool:
    try:
        TavilyClient(api_key=key.strip()).search(query="test", max_results=1)
        return True
    except Exception:
        return False
