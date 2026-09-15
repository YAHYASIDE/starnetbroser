"""The single place audit-log rows get written from.

Centralizing this is a deliberate guardrail: every call site passes
structured, non-secret fields (booleans, counts, ids) and `detail` is built
here from an allow-listed template per action - so a future call site can't
accidentally pass a password/cookie/token through into a log that a support
engineer might read.
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from app.models import AuditLog


def record(
    db: Session,
    *,
    action: str,
    detail: str = "",
    user_id: str | None = None,
    device_id: str | None = None,
    account_id: str | None = None,
    ip_address: str = "",
) -> None:
    entry = AuditLog(
        user_id=user_id,
        device_id=device_id,
        account_id=account_id,
        action=action,
        detail=detail,
        ip_address=ip_address,
    )
    db.add(entry)
    db.flush()
