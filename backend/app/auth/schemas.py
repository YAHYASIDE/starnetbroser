from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=10)
    device_name: str = "جهاز جديد"


class LoginRequest(BaseModel):
    email: EmailStr
    password: str
    totp_code: str | None = None
    device_name: str = "جهاز جديد"


class TotpRequiredResponse(BaseModel):
    totp_required: bool = True


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    device_id: str


class RefreshRequest(BaseModel):
    refresh_token: str


class TotpEnrollResponse(BaseModel):
    secret: str
    provisioning_uri: str


class TotpVerifyRequest(BaseModel):
    code: str


class DeviceOut(BaseModel):
    id: str
    name: str
    created_at: datetime
    last_seen_at: datetime
    is_current: bool

    model_config = {"from_attributes": True}
