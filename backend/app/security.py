"""Password hashing, JWT access/refresh tokens, TOTP 2FA, and the Fernet
vault used to encrypt sensitive StarlinkAccount fields at rest.

Nothing in this module ever logs a secret value - callers must not either.
"""
from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone

import pyotp
from cryptography.fernet import Fernet, InvalidToken
from jose import JWTError, jwt
from passlib.context import CryptContext

from app.config import get_settings

_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


# --- Password hashing -------------------------------------------------

def hash_password(raw: str) -> str:
    return _pwd_context.hash(raw)


def verify_password(raw: str, hashed: str) -> bool:
    return _pwd_context.verify(raw, hashed)


# --- JWT access tokens --------------------------------------------------

def create_access_token(*, user_id: str, device_id: str) -> str:
    settings = get_settings()
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "device_id": device_id,
        "type": "access",
        "iat": now,
        "exp": now + timedelta(minutes=settings.access_token_ttl_minutes),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> dict | None:
    settings = get_settings()
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except JWTError:
        return None
    if payload.get("type") != "access":
        return None
    return payload


# --- Refresh tokens (opaque random string, hash stored in DB) ----------

def generate_refresh_token() -> str:
    return secrets.token_urlsafe(48)


def hash_refresh_token(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def refresh_token_expiry() -> datetime:
    settings = get_settings()
    return datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_ttl_days)


# --- TOTP two-factor authentication -------------------------------------

def generate_totp_secret() -> str:
    return pyotp.random_base32()


def totp_provisioning_uri(secret: str, email: str, issuer: str = "STAR NET Browser") -> str:
    return pyotp.totp.TOTP(secret).provisioning_uri(name=email, issuer_name=issuer)


def verify_totp(secret: str, code: str) -> bool:
    if not code or not secret:
        return False
    return pyotp.TOTP(secret).verify(code, valid_window=1)


# --- Fernet vault for sensitive account fields --------------------------

class Vault:
    """Encrypts/decrypts short strings (passwords, wifi codes, notes).

    Backed by Fernet (AES-128-CBC + HMAC). The key comes from
    settings.vault_key; in production that value should be sourced from a
    KMS/secret manager rather than a plain .env file (see
    docs/DEPLOYMENT.md).
    """

    def __init__(self, key: str | None = None):
        settings = get_settings()
        raw_key = key or settings.vault_key
        self._fernet = Fernet(_normalize_key(raw_key))

    def encrypt(self, plaintext: str) -> str:
        if not plaintext:
            return ""
        return self._fernet.encrypt(plaintext.encode("utf-8")).decode("ascii")

    def decrypt(self, ciphertext: str) -> str:
        if not ciphertext:
            return ""
        try:
            return self._fernet.decrypt(ciphertext.encode("ascii")).decode("utf-8")
        except InvalidToken:
            return ""


def _normalize_key(raw_key: str) -> bytes:
    """Accepts either a real Fernet key or an arbitrary passphrase (dev
    convenience) and always returns a valid 32-byte urlsafe-base64 Fernet key.
    """
    try:
        # Already a valid Fernet key.
        Fernet(raw_key.encode("ascii"))
        return raw_key.encode("ascii")
    except Exception:
        import base64

        digest = hashlib.sha256(raw_key.encode("utf-8")).digest()
        return base64.urlsafe_b64encode(digest)


_vault_singleton: Vault | None = None


def get_vault() -> Vault:
    global _vault_singleton
    if _vault_singleton is None:
        _vault_singleton = Vault()
    return _vault_singleton
