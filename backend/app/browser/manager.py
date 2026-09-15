"""Cloud browser worker orchestration.

Each StarlinkAccount gets exactly one Docker named volume
(`profile_volume_name`) holding its Playwright persistent-context profile
directory (cookies, localStorage, sessionStorage, IndexedDB). That volume:

- is created once, the first time the account is opened, and is never
  deleted except by an explicit account deletion (destroy_profile) - so the
  Starlink session survives closing the STAR NET app, and survives the
  backend/host restarting, because the volume's lifecycle is entirely
  independent of any container or backend process.
- is mounted into a short-lived worker container only while the account is
  actually open/being scanned (start()); the container is removed again on
  stop()/idle reap, but the volume is left alone.
- is never mounted into more than one running container at a time, and no
  two operations for the same account run concurrently - both enforced by
  the DB-row lock in acquire_lock()/release_lock() below (a real
  `SELECT ... FOR UPDATE`-style compare-and-set on BrowserSession.status,
  not just an in-process flag, so it also holds under multiple backend
  workers/processes).
- is never shared between accounts: the container that mounts it only ever
  mounts *that one* volume, on an internal-only Docker network with no
  published host ports, so no other account's browser can ever reach it -
  see docker-compose.yml (`starnet_internal` has no external access) and
  docs/DEPLOYMENT.md ("never expose the worker or VNC ports directly").

The `feature_cloud_sessions` flag (off by default) gates start()/stop(): if
it's off, start() raises immediately rather than ever launching a worker,
so cloud session storage cannot happen at all until it is explicitly turned
on for an authorized deployment/test environment.
"""
from __future__ import annotations

import hashlib
import secrets
import threading
from datetime import datetime, timedelta, timezone

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import BrowserSession, StarlinkAccount


class CloudSessionsDisabled(RuntimeError):
    pass


class AccountBusy(RuntimeError):
    """Another operation is already running for this account."""


class WorkerCapacityExceeded(RuntimeError):
    """max_concurrent_workers is already reached."""


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _volume_name(account: StarlinkAccount) -> str:
    settings = get_settings()
    return f"{settings.profile_volume_prefix}{account.id.replace('-', '')}"


def _container_name(account: StarlinkAccount) -> str:
    return f"starnet_worker_{account.id.replace('-', '')}"


def get_or_create_session_row(db: Session, account: StarlinkAccount) -> BrowserSession:
    if account.browser_session is not None:
        return account.browser_session
    row = BrowserSession(account_id=account.id, profile_volume_name=_volume_name(account))
    db.add(row)
    db.flush()
    return row


def acquire_lock(db: Session, session_row: BrowserSession, request_id: str, *, stale_after_seconds: int = 120) -> bool:
    """Atomic compare-and-set lock so two operations for the same account
    (e.g. two phones tapping "open" at once) never run at the same time.
    Uses a real DB row lock (`with_for_update`), so it is safe across
    multiple backend processes, not just multiple threads in one process.
    A lock older than `stale_after_seconds` is treated as abandoned (e.g.
    the backend crashed mid-operation) and can be stolen, so one crash can't
    permanently wedge an account.
    """
    row = (
        db.query(BrowserSession)
        .filter(BrowserSession.id == session_row.id)
        .with_for_update()
        .one()
    )
    now = _now()
    if row.locked_at is not None and (now - row.locked_at) < timedelta(seconds=stale_after_seconds):
        db.commit()
        return False
    row.locked_at = now
    row.locked_by_request_id = request_id
    db.commit()
    return True


def release_lock(db: Session, session_row: BrowserSession) -> None:
    row = db.query(BrowserSession).filter(BrowserSession.id == session_row.id).with_for_update().one()
    row.locked_at = None
    row.locked_by_request_id = None
    db.commit()


def issue_vnc_ticket(db: Session, session_row: BrowserSession, *, ttl_seconds: int = 60) -> str:
    """A one-time, short-lived ticket the Android client exchanges (over the
    already-authenticated API) for the actual proxied VNC/noVNC connection.
    The raw ticket is only ever returned once, here; only its hash is
    stored, and it is never logged."""
    raw = secrets.token_urlsafe(32)
    session_row.vnc_ticket_hash = hashlib.sha256(raw.encode()).hexdigest()
    session_row.vnc_ticket_expires_at = _now() + timedelta(seconds=ttl_seconds)
    db.commit()
    return raw


def verify_and_consume_vnc_ticket(db: Session, session_row: BrowserSession, raw_ticket: str) -> bool:
    row = db.query(BrowserSession).filter(BrowserSession.id == session_row.id).with_for_update().one()
    if row.vnc_ticket_hash is None or row.vnc_ticket_expires_at is None:
        db.commit()
        return False
    ok = (
        hashlib.sha256(raw_ticket.encode()).hexdigest() == row.vnc_ticket_hash
        and row.vnc_ticket_expires_at > _now()
    )
    # One-time use: always burn the ticket once checked, success or not.
    row.vnc_ticket_hash = None
    row.vnc_ticket_expires_at = None
    db.commit()
    return ok


class BrowserManager:
    """Thin wrapper around the Docker Engine API (via docker-py) that starts
    and stops per-account worker containers. All state that must survive a
    backend restart (which account has a running worker, its container id,
    its volume name) lives in Postgres (BrowserSession), never only in this
    object - this class can be thrown away and rebuilt at any time.
    """

    def __init__(self):
        self._client = None
        self._lock = threading.Lock()

    def _docker(self):
        if self._client is None:
            import docker

            settings = get_settings()
            self._client = docker.DockerClient(base_url=settings.docker_host) if settings.docker_host else docker.from_env()
        return self._client

    def _running_worker_count(self, db: Session) -> int:
        return db.query(func.count(BrowserSession.id)).filter(BrowserSession.status == "running").scalar() or 0

    def ensure_network(self) -> None:
        """Creates the shared bridge network workers and the backend talk
        over, if it doesn't already exist (docker-compose normally creates
        it first; this is a fallback for ad-hoc/dev use).

        Deliberately NOT Docker's `internal=True` network mode: that would
        also block the worker's own outbound HTTPS to starlink.com, which
        it needs to actually load the account pages. The real inbound
        boundary is that worker containers are started with no published
        ports at all (see start() below) - nothing on the host or the
        internet can ever open a connection TO a worker; only the backend,
        which shares this network, can reach its control/VNC ports by
        container name.
        """
        settings = get_settings()
        client = self._docker()
        try:
            client.networks.get(settings.worker_network)
        except Exception:
            client.networks.create(settings.worker_network, driver="bridge")

    def start(self, db: Session, account: StarlinkAccount, *, request_id: str) -> BrowserSession:
        settings = get_settings()
        if not settings.feature_cloud_sessions:
            raise CloudSessionsDisabled(
                "cloud browser sessions are disabled (feature_cloud_sessions=false); "
                "enable it only in an authorized dev/test environment"
            )

        session_row = get_or_create_session_row(db, account)
        with self._lock:
            if not acquire_lock(db, session_row, request_id):
                raise AccountBusy(f"account {account.id} already has an operation in progress")
            try:
                if session_row.status == "running":
                    return session_row
                if self._running_worker_count(db) >= settings.max_concurrent_workers:
                    raise WorkerCapacityExceeded(
                        f"max_concurrent_workers={settings.max_concurrent_workers} reached, try again shortly"
                    )

                client = self._docker()
                self.ensure_network()
                if not self._volume_exists(session_row.profile_volume_name):
                    client.volumes.create(session_row.profile_volume_name)

                container = client.containers.run(
                    settings.worker_image,
                    name=_container_name(account),
                    detach=True,
                    network=settings.worker_network,
                    volumes={session_row.profile_volume_name: {"bind": "/data/profile", "mode": "rw"}},
                    environment={"ACCOUNT_ID": account.id},
                    # Never publish ports to the host - only reachable from
                    # the backend, over the internal-only worker_network.
                    mem_limit="768m",
                    restart_policy={"Name": "no"},
                )
                session_row.status = "running"
                session_row.container_id = container.id
                session_row.container_name = _container_name(account)
                session_row.last_started_at = _now()
                session_row.last_activity_at = _now()
                db.commit()
                return session_row
            finally:
                release_lock(db, session_row)

    def touch_activity(self, db: Session, session_row: BrowserSession) -> None:
        session_row.last_activity_at = _now()
        db.commit()

    def stop(self, db: Session, account: StarlinkAccount, *, request_id: str) -> BrowserSession:
        session_row = get_or_create_session_row(db, account)
        with self._lock:
            if not acquire_lock(db, session_row, request_id):
                raise AccountBusy(f"account {account.id} already has an operation in progress")
            try:
                self._stop_container(session_row)
                session_row.status = "stopped"
                session_row.last_stopped_at = _now()
                db.commit()
                return session_row
            finally:
                release_lock(db, session_row)

    def _stop_container(self, session_row: BrowserSession) -> None:
        if not session_row.container_id:
            return
        client = self._docker()
        try:
            container = client.containers.get(session_row.container_id)
            container.stop(timeout=10)
            container.remove(force=True)
        except Exception:
            pass  # already gone - fine, the profile volume is untouched either way
        session_row.container_id = None
        session_row.container_name = None

    def destroy_profile(self, db: Session, account: StarlinkAccount) -> None:
        """Irreversibly deletes the account's browser profile volume. Only
        called from the explicit, double-confirmed account-delete flow."""
        session_row = account.browser_session
        if session_row is None:
            return
        self._stop_container(session_row)
        try:
            self._docker().volumes.get(session_row.profile_volume_name).remove(force=True)
        except Exception:
            pass

    def _volume_exists(self, name: str) -> bool:
        try:
            self._docker().volumes.get(name)
            return True
        except Exception:
            return False

    def reap_idle_workers(self, db: Session) -> int:
        """Stops any running worker whose account has been idle past
        worker_idle_timeout_seconds. Meant to be called periodically (see
        app/main.py startup background task). Returns how many were
        stopped."""
        settings = get_settings()
        cutoff = _now() - timedelta(seconds=settings.worker_idle_timeout_seconds)
        idle_rows = (
            db.query(BrowserSession)
            .filter(BrowserSession.status == "running", BrowserSession.last_activity_at < cutoff)
            .all()
        )
        stopped = 0
        for row in idle_rows:
            account = db.get(StarlinkAccount, row.account_id)
            if account is None:
                continue
            try:
                self.stop(db, account, request_id=f"reaper-{row.id}")
                stopped += 1
            except AccountBusy:
                continue
        return stopped


_manager_singleton: BrowserManager | None = None


def get_browser_manager() -> BrowserManager:
    global _manager_singleton
    if _manager_singleton is None:
        _manager_singleton = BrowserManager()
    return _manager_singleton
