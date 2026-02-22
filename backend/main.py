"""
Render deployment entry point.

Start command:
    uvicorn main:app --host 0.0.0.0 --port 10000

This file re-exports `app` from app/main.py so Render can find it
at the top of the backend/ directory without touching any business logic.
"""

from app.main import app  # noqa: F401  — re-export for uvicorn

__all__ = ["app"]
