"""A minimal in-process sliding-window rate limiter for the login endpoint.

Good enough for a single backend instance (the MVP deployment target in
docs/DEPLOYMENT.md). If the backend is ever scaled to multiple instances,
replace this with a shared store (Redis) - the call sites in
app/auth/routes.py would not need to change, only this module.
"""
from __future__ import annotations

import time
from collections import defaultdict, deque

from app.config import get_settings

_hits: dict[str, deque[float]] = defaultdict(deque)


def check_and_record(key: str) -> bool:
    """Returns True if this call is allowed, False if the key is rate-limited."""
    settings = get_settings()
    limit = settings.login_rate_limit_per_minute
    now = time.monotonic()
    window = _hits[key]
    while window and now - window[0] > 60:
        window.popleft()
    if len(window) >= limit:
        return False
    window.append(now)
    return True


def reset_for_tests() -> None:
    _hits.clear()
