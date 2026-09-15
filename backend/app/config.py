"""Central configuration, loaded from environment variables (.env in dev).

Nothing secret has a default here except values that are meaningless outside
a local dev/test run (SQLite fallback, a clearly-fake JWT secret). Production
deployments must set every *_SECRET / *_KEY value explicitly - see
docs/DEPLOYMENT.md.
"""
from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # --- Core ---
    environment: str = "development"
    database_url: str = "sqlite:///./dev.db"

    # --- Auth / crypto ---
    # JWT signing key for access/refresh tokens. MUST be overridden in any
    # non-dev environment (see docs/DEPLOYMENT.md).
    jwt_secret: str = "dev-only-insecure-secret-change-me"
    jwt_algorithm: str = "HS256"
    access_token_ttl_minutes: int = 15
    refresh_token_ttl_days: int = 30

    # Fernet key (32 url-safe base64 bytes) used to encrypt sensitive account
    # fields (passwords, wifi codes, notes) at rest in Postgres. In
    # production this should come from a KMS/secret manager, not the .env
    # file directly - see docs/DEPLOYMENT.md "Secrets management".
    vault_key: str = "___DEV_ONLY_VAULT_KEY_DO_NOT_USE_IN_PROD___="

    # --- Feature flags ---
    # Cloud browser session storage (Playwright persistent profiles kept on
    # the server) is gated behind this flag per the compliance requirement:
    # it must stay OFF in production until written authorization is given
    # for server-side storage of encrypted Starlink browser sessions. It can
    # be turned on in development/test to exercise the feature with
    # authorized test accounts.
    feature_cloud_sessions: bool = False

    # --- Browser worker orchestration ---
    docker_host: str | None = None  # None = use local default (unix socket)
    worker_image: str = "starnet-browser-worker:dev"
    worker_network: str = "starnet_internal"
    max_concurrent_workers: int = 4
    worker_idle_timeout_seconds: int = 300
    profile_volume_prefix: str = "starnet_profile_"

    # --- Rate limiting ---
    login_rate_limit_per_minute: int = 10

    cors_allow_origins: list[str] = ["*"]


@lru_cache
def get_settings() -> Settings:
    return Settings()
