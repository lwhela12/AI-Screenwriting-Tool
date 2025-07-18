"""Compatibility module for running ``uvicorn app:app``.

This file imports the FastAPI ``app`` instance from ``main.py`` so that legacy
commands referencing ``app:app`` continue to work.
"""

from .main import app  # noqa: F401  # re-export for Uvicorn
