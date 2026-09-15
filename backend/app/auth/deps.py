from __future__ import annotations

from dataclasses import dataclass

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Device, User
from app.security import decode_access_token

_bearer = HTTPBearer(auto_error=False)


@dataclass
class CurrentIdentity:
    user: User
    device: Device


def get_current_identity(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
) -> CurrentIdentity:
    if credentials is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "missing bearer token")
    payload = decode_access_token(credentials.credentials)
    if payload is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid or expired access token")

    user = db.get(User, payload["sub"])
    device = db.get(Device, payload["device_id"])
    if user is None or device is None or device.user_id != user.id:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid token subject")
    if device.is_revoked:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "device access has been revoked")
    return CurrentIdentity(user=user, device=device)
