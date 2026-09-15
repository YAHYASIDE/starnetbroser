"""Internal control API for one worker container.

Reachable ONLY from the backend, over the internal-only `worker_network`
(see docker-compose.yml - this container publishes no ports to the host).
Owns exactly one Playwright persistent Chromium context bound to
/data/profile (the mounted per-account volume), running inside the Xvfb
display this process also drives x11vnc/noVNC from (see entrypoint.sh).

Every action here is deliberately read-only with respect to the Starlink
account: /navigate only ever loads a URL, /autofill only ever sets the
email/password fields (never clicks submit), /read only ever extracts text
- nothing here can place an order, change a plan, or reboot a device.
"""
from __future__ import annotations

import contextlib
import logging
import sys
from dataclasses import asdict
from pathlib import Path

from fastapi import FastAPI, HTTPException
from playwright.sync_api import BrowserContext, Page, sync_playwright
from pydantic import BaseModel

sys.path.insert(0, str(Path(__file__).parent))
from reader_shared.parser import parse  # noqa: E402

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("starnet-worker")

PROFILE_DIR = "/data/profile"
_SCRIPTS_DIR = Path(__file__).parent
AUTOFILL_JS = (_SCRIPTS_DIR / "autofill.js").read_text(encoding="utf-8")
STATUS_PROBE_JS = (_SCRIPTS_DIR / "status_probe.js").read_text(encoding="utf-8")

app = FastAPI(title="STAR NET worker control API")

_state: dict = {"playwright": None, "context": None, "page": None}


def _ensure_page() -> Page:
    if _state["page"] is not None:
        return _state["page"]

    pw = sync_playwright().start()
    _state["playwright"] = pw
    context: BrowserContext = pw.chromium.launch_persistent_context(
        PROFILE_DIR,
        headless=False,  # a real, visible window - that's what gets shown over VNC
        viewport={"width": 1280, "height": 800},
        args=["--disable-blink-features=AutomationControlled"],
    )
    _state["context"] = context
    page = context.pages[0] if context.pages else context.new_page()
    _state["page"] = page
    return page


class NavigateRequest(BaseModel):
    url: str


class AutofillRequest(BaseModel):
    email: str
    password: str


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/navigate")
def navigate(body: NavigateRequest):
    if not body.url.startswith("https://www.starlink.com/") and not body.url.startswith("https://starlink.com/"):
        raise HTTPException(400, "refusing to navigate outside starlink.com")
    page = _ensure_page()
    page.goto(body.url, wait_until="domcontentloaded", timeout=30_000)
    with contextlib.suppress(Exception):
        page.wait_for_load_state("networkidle", timeout=5_000)
    return {"url": page.url}


@app.post("/autofill")
def autofill(body: AutofillRequest):
    """`body.password` is never logged - only booleans from the page script
    result are returned/logged."""
    page = _ensure_page()
    result = page.evaluate(AUTOFILL_JS, {"email": body.email, "password": body.password})
    logger.info(
        "autofill result: emailFound=%s passwordFound=%s emailFilled=%s passwordFilled=%s",
        result.get("emailFound"),
        result.get("passwordFound"),
        result.get("emailFilled"),
        result.get("passwordFilled"),
    )
    return result


@app.post("/read")
def read():
    page = _ensure_page()
    html = page.content()
    status = page.evaluate(STATUS_PROBE_JS)
    result = parse(
        html,
        dish_status=status.get("dish_status", "UNKNOWN"),
        wifi_status=status.get("wifi_status", "UNKNOWN"),
    )
    return asdict(result)
