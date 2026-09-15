"""Integration tests against a REAL Docker daemon (docker-py + the Docker
Engine API), using a minimal always-available test image
(`starnet-worker-test:dev`, a `FROM scratch` image around a tiny static
binary that just sleeps - see the build steps in the PR description) rather
than the real Chromium/Playwright worker image, which this sandbox's
network policy blocks pulling. These tests exercise the actual
orchestration code path - locking, concurrency limits, volume lifecycle,
container start/stop - against the real Docker API, not a mock.
"""
import time

import docker
import pytest

from app.browser.manager import (
    AccountBusy,
    WorkerCapacityExceeded,
    acquire_lock,
    get_browser_manager,
    get_or_create_session_row,
    release_lock,
)
from app.models import StarlinkAccount

pytestmark = pytest.mark.integration


def _make_account(db, owner_email="worker-test@example.com"):
    from app.models import User
    from app.security import hash_password

    user = db.query(User).filter(User.email == owner_email).first()
    if user is None:
        user = User(email=owner_email, password_hash=hash_password("irrelevant-pw-1234"))
        db.add(user)
        db.flush()
    account = StarlinkAccount(owner_user_id=user.id, name="Integration Test Account")
    db.add(account)
    db.flush()
    db.commit()
    return account


@pytest.fixture(autouse=True)
def _docker_cleanup():
    yield
    client = docker.from_env()
    for c in client.containers.list(all=True, filters={"name": "starnet_worker_"}):
        c.remove(force=True)
    for v in client.volumes.list(filters={"name": "starnet_profile_"}):
        try:
            v.remove(force=True)
        except Exception:
            pass


def test_start_creates_volume_and_running_container(db):
    account = _make_account(db)
    manager = get_browser_manager()

    session_row = manager.start(db, account, request_id="req-1")
    assert session_row.status == "running"
    assert session_row.container_id is not None

    client = docker.from_env()
    container = client.containers.get(session_row.container_id)
    assert container.status == "running"
    volume = client.volumes.get(session_row.profile_volume_name)
    assert volume is not None


def test_session_survives_backend_restart_simulation(db):
    """Simulates "server restart": stop the worker, throw away the
    in-process BrowserManager, build a brand new one, and prove the profile
    volume (and its DB row) are still there and usable."""
    account = _make_account(db)
    manager = get_browser_manager()
    session_row = manager.start(db, account, request_id="req-2")
    volume_name = session_row.profile_volume_name

    manager.stop(db, account, request_id="req-2b")

    # Simulate the backend process restarting: a fresh manager instance,
    # fresh DB lookup - nothing carried over in memory.
    fresh_account = db.get(StarlinkAccount, account.id)
    from app.browser.manager import BrowserManager

    fresh_manager = BrowserManager()
    restarted_session = fresh_manager.start(db, fresh_account, request_id="req-3")

    assert restarted_session.profile_volume_name == volume_name  # same profile, not a new one
    client = docker.from_env()
    assert client.volumes.get(volume_name) is not None


def test_lock_prevents_concurrent_operations_on_same_account(db):
    account = _make_account(db)
    session_row = get_or_create_session_row(db, account)

    assert acquire_lock(db, session_row, "req-A") is True
    # A second caller must be refused while the first lock is held.
    assert acquire_lock(db, session_row, "req-B") is False

    release_lock(db, session_row)
    assert acquire_lock(db, session_row, "req-B") is True


def test_manager_raises_account_busy_when_locked(db, monkeypatch):
    account = _make_account(db)
    session_row = get_or_create_session_row(db, account)
    acquire_lock(db, session_row, "someone-else")

    manager = get_browser_manager()
    with pytest.raises(AccountBusy):
        manager.start(db, account, request_id="req-blocked")


def test_concurrency_limit_enforced(db):
    from app.config import get_settings

    limit = get_settings().max_concurrent_workers
    manager = get_browser_manager()
    accounts = [_make_account(db, owner_email=f"cap-{i}@example.com") for i in range(limit + 1)]

    for account in accounts[:limit]:
        manager.start(db, account, request_id=f"req-{account.id}")

    with pytest.raises(WorkerCapacityExceeded):
        manager.start(db, accounts[limit], request_id="req-over-limit")


def test_stop_removes_container_but_keeps_volume(db):
    account = _make_account(db)
    manager = get_browser_manager()
    session_row = manager.start(db, account, request_id="req-4")
    volume_name = session_row.profile_volume_name
    container_id = session_row.container_id

    manager.stop(db, account, request_id="req-4b")

    client = docker.from_env()
    with pytest.raises(docker.errors.NotFound):
        client.containers.get(container_id)
    assert client.volumes.get(volume_name) is not None  # profile survives


def test_destroy_profile_removes_volume_too(db):
    account = _make_account(db)
    manager = get_browser_manager()
    session_row = manager.start(db, account, request_id="req-5")
    volume_name = session_row.profile_volume_name

    manager.destroy_profile(db, account)

    client = docker.from_env()
    with pytest.raises(docker.errors.NotFound):
        client.volumes.get(volume_name)


def test_idle_reaper_stops_inactive_workers(db):
    account = _make_account(db)
    manager = get_browser_manager()
    session_row = manager.start(db, account, request_id="req-6")

    # WORKER_IDLE_TIMEOUT_SECONDS=1 in test settings - wait it out.
    time.sleep(2)
    stopped = manager.reap_idle_workers(db)
    assert stopped == 1

    db.refresh(session_row)
    assert session_row.status == "stopped"
