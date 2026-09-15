from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class AccountCreate(BaseModel):
    name: str = ""
    email: str = ""
    email_secret: str = ""
    wifi_code: str = ""
    kit_number: str = ""
    serial_number: str = ""
    account_number: str = ""
    subscription_id: str = ""
    recharge_date: str = ""
    notes: str = ""


class AccountUpdate(AccountCreate):
    pass


class AccountSummary(BaseModel):
    """List view - never includes decrypted secrets."""

    id: str
    name: str
    device_name: str
    kit_number: str
    serial_number: str
    standby_date: str
    recharge_date: str
    balance_due: str
    currency: str
    dish_status: str
    wifi_status: str
    alert_reason: str
    last_updated: str
    plan_name: str

    model_config = {"from_attributes": True}


class AccountDetail(AccountSummary):
    """Single-account detail view - includes decrypted secrets, only ever
    returned to the account's own owner, only over HTTPS, and the client is
    expected to keep them masked behind a reveal toggle."""

    email: str
    email_secret: str
    wifi_code: str
    notes: str
    account_number: str
    subscription_id: str
    starlink_id: str
    service_status: str
    service_location: str
    billing_period: str
    payment_due_date: str
    software_version: str
    uptime: str
    last_successful_scan_at: datetime | None
