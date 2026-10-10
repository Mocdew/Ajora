"""FastAPI dependencies.

The provider is a process-wide singleton: it is stateless aside from an in-memory
``user_id -> path`` index, so one instance serves every request. Swapping in a live
provider later is a one-line change here.
"""

from __future__ import annotations

from functools import lru_cache

from .providers import DataProvider, FilePersonaProvider

__all__ = ["get_provider"]


@lru_cache(maxsize=1)
def get_provider() -> DataProvider:
    return FilePersonaProvider()
