from __future__ import annotations

from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.accounts.schemas import AccountCreate, AccountDetail, AccountSummary
from app.auth.deps import CurrentIdentity
from app.models import StarlinkAccount
from app.reader.parser import ReadResult
from app.security import get_vault


def get_owned_account_or_404(db: Session, identity: CurrentIdentity, account_id: str) -> StarlinkAccount:
    account = (
        db.query(StarlinkAccount)
        .filter(StarlinkAccount.id == account_id, StarlinkAccount.owner_user_id == identity.user.id)
        .first()
    )
    if account is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "account not found")
    return account


def to_summary(account: StarlinkAccount) -> AccountSummary:
    return AccountSummary.model_validate(account)


def to_detail(account: StarlinkAccount) -> AccountDetail:
    vault = get_vault()
    return AccountDetail(
        **AccountSummary.model_validate(account).model_dump(),
        email=account.email,
        email_secret=vault.decrypt(account.email_secret_encrypted),
        wifi_code=vault.decrypt(account.wifi_code_encrypted),
        notes=vault.decrypt(account.notes_encrypted),
        account_number=account.account_number,
        subscription_id=account.subscription_id,
        starlink_id=account.starlink_id,
        service_status=account.service_status,
        service_location=account.service_location,
        billing_period=account.billing_period,
        payment_due_date=account.payment_due_date,
        software_version=account.software_version,
        uptime=account.uptime,
        last_successful_scan_at=account.last_successful_scan_at,
    )


def apply_create(account: StarlinkAccount, body: AccountCreate) -> None:
    vault = get_vault()
    account.name = body.name.strip()
    account.email = body.email.strip()
    account.email_secret_encrypted = vault.encrypt(body.email_secret)
    account.wifi_code_encrypted = vault.encrypt(body.wifi_code)
    account.kit_number = body.kit_number.strip()
    account.serial_number = body.serial_number.strip()
    account.account_number = body.account_number.strip()
    account.subscription_id = body.subscription_id.strip()
    account.recharge_date = body.recharge_date.strip()
    account.notes_encrypted = vault.encrypt(body.notes)


def apply_snapshot(account: StarlinkAccount, snapshot: ReadResult) -> bool:
    """Merge a scan result into the account, field by field, never blanking
    a previously-known-good value with an empty read. Returns True if any
    field actually changed data (used to decide whether to touch
    last_successful_scan_at / last_updated at all).

    This directly implements the "never replace a real reading with
    'not read' on a transient error" requirement: `ReadResult` fields are
    only ever non-empty strings or DeviceStatus values, and a failed/partial
    scan naturally produces empty ones for whatever it couldn't find - those
    empty values are simply skipped here rather than written over history.
    """
    changed = False

    def set_if_present(attr: str, value: str) -> None:
        nonlocal changed
        if value and getattr(account, attr) != value:
            setattr(account, attr, value)
            changed = True

    set_if_present("balance_due", snapshot.balance_due)
    set_if_present("device_name", snapshot.device_name)
    if snapshot.currency:
        set_if_present("currency", snapshot.currency)
    set_if_present("standby_date", snapshot.standby_date)
    set_if_present("kit_number", snapshot.kit_number)
    set_if_present("serial_number", snapshot.serial_number)
    set_if_present("subscription_id", snapshot.subscription_id)
    set_if_present("account_number", snapshot.account_number)
    set_if_present("starlink_id", snapshot.starlink_id)
    set_if_present("plan_name", snapshot.plan_name)
    set_if_present("service_status", snapshot.service_status)
    set_if_present("service_location", snapshot.service_location)
    set_if_present("billing_period", snapshot.billing_period)
    set_if_present("payment_due_date", snapshot.payment_due_date)
    set_if_present("software_version", snapshot.software_version)
    set_if_present("uptime", snapshot.uptime)
    set_if_present("alert_reason", snapshot.alert_reason)
    if snapshot.dish_status != "UNKNOWN":
        set_if_present("dish_status", snapshot.dish_status)
    if snapshot.wifi_status != "UNKNOWN":
        set_if_present("wifi_status", snapshot.wifi_status)

    if snapshot.has_any_data():
        account.last_successful_scan_at = datetime.now(timezone.utc)
        account.last_updated = snapshot.last_updated or account.last_updated

    return changed
