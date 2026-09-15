from __future__ import annotations

import os

# Force test settings BEFORE any app module reads them via get_settings().
os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://postgres:postgres@localhost:5432/starnet_test")
os.environ.setdefault("JWT_SECRET", "test-secret-not-for-prod")
os.environ.setdefault("VAULT_KEY", "test-vault-key-not-for-prod")
os.environ.setdefault("FEATURE_CLOUD_SESSIONS", "true")
os.environ.setdefault("WORKER_IMAGE", "starnet-worker-test:dev")
os.environ.setdefault("WORKER_NETWORK", "starnet_test_net")
os.environ.setdefault("MAX_CONCURRENT_WORKERS", "2")
os.environ.setdefault("WORKER_IDLE_TIMEOUT_SECONDS", "1")
os.environ.setdefault("LOGIN_RATE_LIMIT_PER_MINUTE", "1000")

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.config import get_settings
from app.db import Base
from app.main import app
from app.db import get_db

get_settings.cache_clear()
_settings = get_settings()

engine = create_engine(_settings.database_url, pool_pre_ping=True)
TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


@pytest.fixture(autouse=True)
def _clean_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def db():
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def client():
    def _override_get_db():
        session = TestingSessionLocal()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = _override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def registered_user(client):
    resp = client.post(
        "/auth/register",
        json={"email": "operator@example.com", "password": "correct-horse-battery", "device_name": "Phone A"},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


@pytest.fixture
def auth_headers(registered_user):
    return {"Authorization": f"Bearer {registered_user['access_token']}"}
