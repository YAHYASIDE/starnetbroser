from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app import audit
from app.auth.deps import CurrentIdentity, get_current_identity
from app.auth.rate_limit import check_and_record
from app.auth.schemas import (
    DeviceOut,
    LoginRequest,
    RefreshRequest,
    RegisterRequest,
    TokenPair,
    TotpEnrollResponse,
    TotpVerifyRequest,
)
from app.db import get_db
from app.models import Device, RefreshToken, User
from app.security import (
    create_access_token,
    generate_refresh_token,
    generate_totp_secret,
    get_vault,
    hash_password,
    hash_refresh_token,
    refresh_token_expiry,
    totp_provisioning_uri,
    verify_password,
    verify_totp,
)

router = APIRouter(prefix="/auth", tags=["auth"])


def _client_ip(request: Request) -> str:
    return request.client.host if request.client else ""


def _issue_token_pair(db: Session, user: User, device: Device) -> tuple[TokenPair, RefreshToken]:
    access = create_access_token(user_id=user.id, device_id=device.id)
    raw_refresh = generate_refresh_token()
    token_row = RefreshToken(
        user_id=user.id,
        device_id=device.id,
        token_hash=hash_refresh_token(raw_refresh),
        expires_at=refresh_token_expiry(),
    )
    db.add(token_row)
    db.flush()
    pair = TokenPair(access_token=access, refresh_token=raw_refresh, device_id=device.id)
    return pair, token_row


@router.post("/register", response_model=TokenPair, status_code=status.HTTP_201_CREATED)
def register(body: RegisterRequest, request: Request, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == body.email.lower()).first()
    if existing is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "email already registered")

    user = User(email=body.email.lower(), password_hash=hash_password(body.password))
    db.add(user)
    db.flush()

    device = Device(user_id=user.id, name=body.device_name)
    db.add(device)
    db.flush()

    pair, _ = _issue_token_pair(db, user, device)
    audit.record(
        db, action="register", user_id=user.id, device_id=device.id, ip_address=_client_ip(request)
    )
    db.commit()
    return pair


@router.post("/login", response_model=TokenPair)
def login(body: LoginRequest, request: Request, db: Session = Depends(get_db)):
    ip = _client_ip(request)
    if not check_and_record(f"login:{ip}:{body.email.lower()}"):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "too many login attempts, try again shortly")

    user = db.query(User).filter(User.email == body.email.lower()).first()
    if user is None or not verify_password(body.password, user.password_hash):
        audit.record(db, action="login_failed", detail="bad credentials", ip_address=ip)
        db.commit()
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid email or password")

    if user.totp_enabled:
        if not body.totp_code:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "totp_required")
        secret = get_vault().decrypt(user.totp_secret_encrypted or "")
        if not verify_totp(secret, body.totp_code):
            audit.record(db, action="login_failed", user_id=user.id, detail="bad totp", ip_address=ip)
            db.commit()
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid two-factor code")

    device = Device(user_id=user.id, name=body.device_name)
    db.add(device)
    db.flush()

    pair, _ = _issue_token_pair(db, user, device)
    audit.record(db, action="login", user_id=user.id, device_id=device.id, ip_address=ip)
    db.commit()
    return pair


@router.post("/refresh", response_model=TokenPair)
def refresh(body: RefreshRequest, request: Request, db: Session = Depends(get_db)):
    token_hash = hash_refresh_token(body.refresh_token)
    row = db.query(RefreshToken).filter(RefreshToken.token_hash == token_hash).first()
    if row is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid refresh token")

    if row.revoked_at is not None:
        # Reuse of an already-rotated-away token: treat as a stolen token
        # and kill the whole device (every refresh token it holds).
        db.query(RefreshToken).filter(
            RefreshToken.device_id == row.device_id, RefreshToken.revoked_at.is_(None)
        ).update({"revoked_at": datetime.now(timezone.utc)})
        device = db.get(Device, row.device_id)
        if device is not None:
            device.revoked_at = datetime.now(timezone.utc)
        audit.record(
            db,
            action="refresh_reuse_detected",
            user_id=row.user_id,
            device_id=row.device_id,
            detail="revoked device after refresh-token replay",
            ip_address=_client_ip(request),
        )
        db.commit()
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "refresh token reuse detected, device revoked")

    if not row.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "refresh token expired")

    user = db.get(User, row.user_id)
    device = db.get(Device, row.device_id)
    if user is None or device is None or device.is_revoked:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "device access has been revoked")

    pair, new_token_row = _issue_token_pair(db, user, device)
    row.revoked_at = datetime.now(timezone.utc)
    row.replaced_by_id = new_token_row.id
    device.last_seen_at = datetime.now(timezone.utc)
    db.commit()
    return pair


@router.post("/totp/enroll", response_model=TotpEnrollResponse)
def totp_enroll(identity: CurrentIdentity = Depends(get_current_identity), db: Session = Depends(get_db)):
    user = identity.user
    secret = generate_totp_secret()
    user.totp_secret_encrypted = get_vault().encrypt(secret)
    user.totp_enabled = False  # not active until verified
    db.commit()
    return TotpEnrollResponse(secret=secret, provisioning_uri=totp_provisioning_uri(secret, user.email))


@router.post("/totp/verify")
def totp_verify(
    body: TotpVerifyRequest,
    identity: CurrentIdentity = Depends(get_current_identity),
    db: Session = Depends(get_db),
):
    user = identity.user
    secret = get_vault().decrypt(user.totp_secret_encrypted or "")
    if not verify_totp(secret, body.code):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "invalid code")
    user.totp_enabled = True
    db.commit()
    return {"totp_enabled": True}


@router.get("/devices", response_model=list[DeviceOut])
def list_devices(identity: CurrentIdentity = Depends(get_current_identity), db: Session = Depends(get_db)):
    devices = (
        db.query(Device)
        .filter(Device.user_id == identity.user.id, Device.revoked_at.is_(None))
        .order_by(Device.last_seen_at.desc())
        .all()
    )
    return [
        DeviceOut(
            id=d.id,
            name=d.name,
            created_at=d.created_at,
            last_seen_at=d.last_seen_at,
            is_current=(d.id == identity.device.id),
        )
        for d in devices
    ]


@router.delete("/devices/{device_id}")
def revoke_device(
    device_id: str,
    request: Request,
    identity: CurrentIdentity = Depends(get_current_identity),
    db: Session = Depends(get_db),
):
    device = db.get(Device, device_id)
    if device is None or device.user_id != identity.user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "device not found")
    device.revoked_at = datetime.now(timezone.utc)
    db.query(RefreshToken).filter(
        RefreshToken.device_id == device.id, RefreshToken.revoked_at.is_(None)
    ).update({"revoked_at": datetime.now(timezone.utc)})
    audit.record(
        db,
        action="device_revoked",
        user_id=identity.user.id,
        device_id=device.id,
        detail="revoked by user" + (" (self)" if device.id == identity.device.id else ""),
        ip_address=_client_ip(request),
    )
    db.commit()
    return {"revoked": True}


@router.post("/logout-all")
def logout_all(
    request: Request,
    identity: CurrentIdentity = Depends(get_current_identity),
    db: Session = Depends(get_db),
):
    now = datetime.now(timezone.utc)
    db.query(Device).filter(Device.user_id == identity.user.id, Device.revoked_at.is_(None)).update(
        {"revoked_at": now}
    )
    db.query(RefreshToken).filter(
        RefreshToken.user_id == identity.user.id, RefreshToken.revoked_at.is_(None)
    ).update({"revoked_at": now})
    audit.record(
        db, action="logout_all", user_id=identity.user.id, device_id=identity.device.id, ip_address=_client_ip(request)
    )
    db.commit()
    return {"logged_out": True}
