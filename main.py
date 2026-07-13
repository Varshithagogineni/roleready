"""Vercel entrypoint — exposes the FastAPI app for Vercel's FastAPI runtime.

Vercel auto-detects `app` here; locally/Render we run backend.server:app directly.
"""

from backend.server import app  # noqa: F401
