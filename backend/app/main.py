from __future__ import annotations

import asyncio
import contextlib
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.accounts.routes import router as accounts_router
from app.auth.routes import router as auth_router
from app.browser.manager import get_browser_manager
from app.browser.routes import router as browser_router
from app.config import get_settings
from app.db import SessionLocal

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("starnet")


@contextlib.asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    stop_event = asyncio.Event()

    async def _reap_loop():
        manager = get_browser_manager()
        while not stop_event.is_set():
            try:
                db = SessionLocal()
                try:
                    stopped = manager.reap_idle_workers(db)
                    if stopped:
                        logger.info("idle reaper stopped %d worker(s)", stopped)
                finally:
                    db.close()
            except Exception:
                logger.exception("idle reaper tick failed")
            with contextlib.suppress(TimeoutError):
                await asyncio.wait_for(stop_event.wait(), timeout=30)

    task = asyncio.create_task(_reap_loop()) if settings.feature_cloud_sessions else None
    try:
        yield
    finally:
        stop_event.set()
        if task is not None:
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await task


app = FastAPI(title="STAR NET Browser Cloud API", lifespan=lifespan)

_settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=_settings.cors_allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(accounts_router)
app.include_router(browser_router)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/config")
def public_config():
    """Non-secret runtime flags the client needs before login (e.g. whether
    to even show the "cloud session" UI)."""
    settings = get_settings()
    return {"feature_cloud_sessions": settings.feature_cloud_sessions}
