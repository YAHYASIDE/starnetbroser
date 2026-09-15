from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, WebSocket, WebSocketDisconnect, status
from sqlalchemy.orm import Session

from app import audit
from app.accounts.service import apply_snapshot, get_owned_account_or_404
from app.auth.deps import CurrentIdentity, get_current_identity
from app.browser.manager import (
    AccountBusy,
    CloudSessionsDisabled,
    WorkerCapacityExceeded,
    get_browser_manager,
    get_or_create_session_row,
    issue_vnc_ticket,
    verify_and_consume_vnc_ticket,
)
from app.browser.schemas import BrowserStatus, ScanResult, VncTicketResponse
from app.browser.worker_client import WorkerClient, WorkerUnreachable
from app.config import get_settings
from app.db import get_db
from app.reader.parser import ReadResult

router = APIRouter(prefix="/accounts/{account_id}/browser", tags=["browser"])

STARLINK_LOGIN_URL = "https://www.starlink.com/account/home"


def _client_ip(request: Request) -> str:
    return request.client.host if request.client else ""


@router.get("/status", response_model=BrowserStatus)
def get_status(
    account_id: str,
    identity: CurrentIdentity = Depends(get_current_identity),
    db: Session = Depends(get_db),
):
    account = get_owned_account_or_404(db, identity, account_id)
    session_row = get_or_create_session_row(db, account)
    db.commit()
    return BrowserStatus(
        status=session_row.status,
        last_started_at=session_row.last_started_at,
        last_stopped_at=session_row.last_stopped_at,
        last_activity_at=session_row.last_activity_at,
    )


@router.post("/start", response_model=BrowserStatus)
def start_browser(
    account_id: str,
    request: Request,
    identity: CurrentIdentity = Depends(get_current_identity),
    db: Session = Depends(get_db),
):
    account = get_owned_account_or_404(db, identity, account_id)
    try:
        session_row = get_browser_manager().start(db, account, request_id=str(uuid.uuid4()))
    except CloudSessionsDisabled as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from exc
    except AccountBusy as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
    except WorkerCapacityExceeded as exc:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, str(exc)) from exc

    audit.record(
        db,
        action="browser_started",
        user_id=identity.user.id,
        device_id=identity.device.id,
        account_id=account.id,
        ip_address=_client_ip(request),
    )
    db.commit()
    return BrowserStatus(
        status=session_row.status,
        last_started_at=session_row.last_started_at,
        last_stopped_at=session_row.last_stopped_at,
        last_activity_at=session_row.last_activity_at,
    )


@router.post("/stop", response_model=BrowserStatus)
def stop_browser(
    account_id: str,
    request: Request,
    identity: CurrentIdentity = Depends(get_current_identity),
    db: Session = Depends(get_db),
):
    account = get_owned_account_or_404(db, identity, account_id)
    try:
        session_row = get_browser_manager().stop(db, account, request_id=str(uuid.uuid4()))
    except AccountBusy as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc

    audit.record(
        db,
        action="browser_stopped",
        user_id=identity.user.id,
        device_id=identity.device.id,
        account_id=account.id,
        ip_address=_client_ip(request),
    )
    db.commit()
    return BrowserStatus(
        status=session_row.status,
        last_started_at=session_row.last_started_at,
        last_stopped_at=session_row.last_stopped_at,
        last_activity_at=session_row.last_activity_at,
    )


@router.post("/scan", response_model=ScanResult)
def scan_now(
    account_id: str,
    request: Request,
    identity: CurrentIdentity = Depends(get_current_identity),
    db: Session = Depends(get_db),
):
    """Autofills saved credentials (if the login form is showing) and reads
    whatever account data is currently visible - both strictly read-only,
    see worker/control_server.py. The worker must already be running (call
    /start first); this never clicks Sign In and never navigates through
    any page that could change the account."""
    account = get_owned_account_or_404(db, identity, account_id)
    session_row = get_or_create_session_row(db, account)
    if session_row.status != "running" or not session_row.container_name:
        raise HTTPException(status.HTTP_409_CONFLICT, "browser is not running - call /start first")

    manager = get_browser_manager()
    manager.touch_activity(db, session_row)
    worker = WorkerClient(session_row.container_name)

    try:
        worker.navigate(STARLINK_LOGIN_URL)
        from app.security import get_vault

        vault = get_vault()
        worker.autofill(account.email, vault.decrypt(account.email_secret_encrypted))
        raw = worker.read()
    except WorkerUnreachable as exc:
        audit.record(
            db,
            action="scan_failed",
            user_id=identity.user.id,
            device_id=identity.device.id,
            account_id=account.id,
            detail="worker unreachable",
            ip_address=_client_ip(request),
        )
        db.commit()
        return ScanResult(reachable=False, fields_found=[], message=f"تعذر الوصول إلى المتصفح السحابي: {exc}")

    snapshot = ReadResult(**{k: v for k, v in raw.items() if k in ReadResult.__dataclass_fields__})
    apply_snapshot(account, snapshot)
    audit.record(
        db,
        action="scan_completed",
        user_id=identity.user.id,
        device_id=identity.device.id,
        account_id=account.id,
        detail=f"fields_found={snapshot.fields_found}",
        ip_address=_client_ip(request),
    )
    db.commit()
    return ScanResult(reachable=True, fields_found=snapshot.fields_found or [], message="تم الفحص")


@router.post("/vnc-ticket", response_model=VncTicketResponse)
def create_vnc_ticket(
    account_id: str,
    identity: CurrentIdentity = Depends(get_current_identity),
    db: Session = Depends(get_db),
):
    account = get_owned_account_or_404(db, identity, account_id)
    session_row = get_or_create_session_row(db, account)
    if session_row.status != "running":
        raise HTTPException(status.HTTP_409_CONFLICT, "browser is not running - call /start first")
    ticket = issue_vnc_ticket(db, session_row)
    return VncTicketResponse(ticket=ticket, expires_in_seconds=60)


@router.websocket("/vnc")
async def vnc_proxy(websocket: WebSocket, account_id: str, ticket: str):
    """Proxies the client's WebSocket to the worker's internal noVNC
    websocket, after validating the one-time ticket. This is the ONLY path
    by which a phone ever reaches the remote browser's screen - the worker's
    VNC port is never exposed directly (see docker-compose.yml,
    worker_network has no published ports)."""
    from app.db import SessionLocal
    from app.models import StarlinkAccount

    db = SessionLocal()
    try:
        account = db.get(StarlinkAccount, account_id)
        if account is None or account.browser_session is None:
            await websocket.close(code=4404)
            return
        session_row = account.browser_session
        if not verify_and_consume_vnc_ticket(db, session_row, ticket):
            await websocket.close(code=4401)
            return
        if session_row.status != "running" or not session_row.container_name:
            await websocket.close(code=4409)
            return
        container_name = session_row.container_name
    finally:
        db.close()

    import websockets

    await websocket.accept(subprotocol="binary")
    settings = get_settings()
    upstream_url = f"ws://{container_name}:{6080}/websockify"
    try:
        async with websockets.connect(upstream_url, subprotocols=["binary"]) as upstream:
            import asyncio

            async def to_upstream():
                try:
                    while True:
                        data = await websocket.receive_bytes()
                        await upstream.send(data)
                except WebSocketDisconnect:
                    pass

            async def to_client():
                try:
                    async for message in upstream:
                        await websocket.send_bytes(
                            message if isinstance(message, (bytes, bytearray)) else message.encode()
                        )
                except Exception:
                    pass

            done, pending = await asyncio.wait(
                [asyncio.create_task(to_upstream()), asyncio.create_task(to_client())],
                return_when=asyncio.FIRST_COMPLETED,
            )
            for task in pending:
                task.cancel()
    except Exception:
        await websocket.close(code=1011)
    _ = settings  # reserved for future TLS/origin checks on the upstream URL
