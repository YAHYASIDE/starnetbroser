from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


def _uuid() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    """A STAR NET app account (management login) - NOT a Starlink account."""

    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    totp_secret_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    totp_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    devices: Mapped[list["Device"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    accounts: Mapped[list["StarlinkAccount"]] = relationship(back_populates="owner", cascade="all, delete-orphan")


class Device(Base):
    """A phone/browser that has logged into the STAR NET management account."""

    __tablename__ = "devices"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(255), default="جهاز غير مسمى")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    user: Mapped[User] = relationship(back_populates="devices")
    refresh_tokens: Mapped[list["RefreshToken"]] = relationship(back_populates="device", cascade="all, delete-orphan")

    @property
    def is_revoked(self) -> bool:
        return self.revoked_at is not None


class RefreshToken(Base):
    """Rotating refresh tokens. Only the SHA-256 hash of the token is stored.

    Rotation + reuse detection: each successful refresh issues a new token
    and marks this row `revoked_at` + `replaced_by_id`. If a token that is
    already revoked is presented again (a sign it was stolen and replayed),
    the whole chain - and the device - is force-revoked.
    """

    __tablename__ = "refresh_tokens"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    device_id: Mapped[str] = mapped_column(String(36), ForeignKey("devices.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    replaced_by_id: Mapped[str | None] = mapped_column(String(36), nullable=True)

    device: Mapped[Device] = relationship(back_populates="refresh_tokens")

    @property
    def is_active(self) -> bool:
        return self.revoked_at is None and self.expires_at > _now()


class StarlinkAccount(Base):
    """One managed Starlink account/line, scoped to exactly one owner user.

    All row access in the API layer is filtered by owner_user_id - see
    app/accounts/routes.py - which is what actually enforces isolation
    between different STAR NET operators. Sensitive fields are stored
    Fernet-encrypted (see app/vault) and are never included in list
    responses, only in the single-account detail view, and never logged.
    """

    __tablename__ = "starlink_accounts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    owner_user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True)

    name: Mapped[str] = mapped_column(String(255), default="")
    email: Mapped[str] = mapped_column(String(255), default="")
    email_secret_encrypted: Mapped[str] = mapped_column(Text, default="")
    wifi_code_encrypted: Mapped[str] = mapped_column(Text, default="")
    notes_encrypted: Mapped[str] = mapped_column(Text, default="")

    device_name: Mapped[str] = mapped_column(String(200), default="")
    kit_number: Mapped[str] = mapped_column(String(120), default="")
    serial_number: Mapped[str] = mapped_column(String(120), default="")
    account_number: Mapped[str] = mapped_column(String(120), default="")
    subscription_id: Mapped[str] = mapped_column(String(120), default="")
    starlink_id: Mapped[str] = mapped_column(String(120), default="")

    recharge_date: Mapped[str] = mapped_column(String(64), default="")
    standby_date: Mapped[str] = mapped_column(String(64), default="")

    balance_due: Mapped[str] = mapped_column(String(32), default="")
    currency: Mapped[str] = mapped_column(String(8), default="$")
    dish_status: Mapped[str] = mapped_column(String(16), default="UNKNOWN")
    wifi_status: Mapped[str] = mapped_column(String(16), default="UNKNOWN")
    alert_reason: Mapped[str] = mapped_column(String(400), default="")
    plan_name: Mapped[str] = mapped_column(String(200), default="")
    service_status: Mapped[str] = mapped_column(String(64), default="")
    service_location: Mapped[str] = mapped_column(String(200), default="")
    billing_period: Mapped[str] = mapped_column(String(200), default="")
    payment_due_date: Mapped[str] = mapped_column(String(64), default="")
    software_version: Mapped[str] = mapped_column(String(64), default="")
    uptime: Mapped[str] = mapped_column(String(64), default="")

    # Last time ANY field above was updated by a successful scan. A failed
    # or partial scan must never blank these out - see
    # app/accounts/service.py apply_snapshot().
    last_updated: Mapped[str] = mapped_column(String(64), default="")
    last_successful_scan_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)

    owner: Mapped[User] = relationship(back_populates="accounts")
    browser_session: Mapped["BrowserSession | None"] = relationship(
        back_populates="account", cascade="all, delete-orphan", uselist=False
    )


class BrowserSession(Base):
    """The cloud browser worker state for exactly one StarlinkAccount.

    `profile_volume_name` is a Docker named volume holding the Playwright
    persistent profile directory (cookies, localStorage, sessionStorage,
    IndexedDB). The volume is never deleted when the worker container
    stops - only when the account itself is deleted - so the Starlink
    session survives app restarts, server restarts, and container
    recreation. `status` plus `locked_at` form the mutual-exclusion gate
    that stops two operations running for the same account at once - see
    app/browser/manager.py.
    """

    __tablename__ = "browser_sessions"
    __table_args__ = (UniqueConstraint("account_id"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    account_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("starlink_accounts.id", ondelete="CASCADE"), index=True
    )
    profile_volume_name: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    status: Mapped[str] = mapped_column(String(16), default="stopped")  # stopped|starting|running|stopping
    container_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    container_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    vnc_ticket_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    vnc_ticket_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    locked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    locked_by_request_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    last_started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_stopped_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_activity_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    account: Mapped[StarlinkAccount] = relationship(back_populates="browser_session")


class AuditLog(Base):
    """Security log: logins, device revocations, account opens/scans.

    `detail` is a short human-readable string built from non-secret data
    only (booleans, counts, field names) - see app/audit.py, which is the
    single place log entries get written from, precisely so no call site
    can accidentally pass a password/cookie/token through.
    """

    __tablename__ = "audit_log"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    device_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    account_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    action: Mapped[str] = mapped_column(String(64), nullable=False)
    detail: Mapped[str] = mapped_column(String(500), default="")
    ip_address: Mapped[str] = mapped_column(String(64), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)
