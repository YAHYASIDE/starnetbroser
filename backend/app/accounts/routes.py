"""Starlink account CRUD.

Isolation between STAR NET operators is enforced here, not just at the DB
schema level: every query filters by `StarlinkAccount.owner_user_id ==
identity.user.id`, and a lookup for an account owned by someone else returns
404 (not 403) so its existence isn't leaked either. See
tests/test_accounts_isolation.py for the enforcement tests.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.orm import Session

from app import audit
from app.accounts.schemas import AccountCreate, AccountDetail, AccountSummary, AccountUpdate
from app.accounts.service import apply_create, get_owned_account_or_404, to_detail, to_summary
from app.auth.deps import CurrentIdentity, get_current_identity
from app.db import get_db
from app.models import StarlinkAccount

router = APIRouter(prefix="/accounts", tags=["accounts"])


@router.get("", response_model=list[AccountSummary])
def list_accounts(identity: CurrentIdentity = Depends(get_current_identity), db: Session = Depends(get_db)):
    accounts = (
        db.query(StarlinkAccount)
        .filter(StarlinkAccount.owner_user_id == identity.user.id)
        .order_by(StarlinkAccount.name)
        .all()
    )
    return [to_summary(a) for a in accounts]


@router.post("", response_model=AccountDetail, status_code=status.HTTP_201_CREATED)
def create_account(
    body: AccountCreate,
    request: Request,
    identity: CurrentIdentity = Depends(get_current_identity),
    db: Session = Depends(get_db),
):
    account = StarlinkAccount(owner_user_id=identity.user.id)
    apply_create(account, body)
    db.add(account)
    db.flush()
    audit.record(
        db,
        action="account_created",
        user_id=identity.user.id,
        device_id=identity.device.id,
        account_id=account.id,
        ip_address=request.client.host if request.client else "",
    )
    db.commit()
    db.refresh(account)
    return to_detail(account)


@router.get("/{account_id}", response_model=AccountDetail)
def get_account(
    account_id: str,
    identity: CurrentIdentity = Depends(get_current_identity),
    db: Session = Depends(get_db),
):
    account = get_owned_account_or_404(db, identity, account_id)
    return to_detail(account)


@router.put("/{account_id}", response_model=AccountDetail)
def update_account(
    account_id: str,
    body: AccountUpdate,
    request: Request,
    identity: CurrentIdentity = Depends(get_current_identity),
    db: Session = Depends(get_db),
):
    account = get_owned_account_or_404(db, identity, account_id)
    apply_create(account, body)
    audit.record(
        db,
        action="account_updated",
        user_id=identity.user.id,
        device_id=identity.device.id,
        account_id=account.id,
        ip_address=request.client.host if request.client else "",
    )
    db.commit()
    db.refresh(account)
    return to_detail(account)


@router.delete("/{account_id}")
def delete_account(
    account_id: str,
    request: Request,
    identity: CurrentIdentity = Depends(get_current_identity),
    db: Session = Depends(get_db),
):
    """Deletes the account row AND its browser profile volume (see
    app/browser/manager.py:destroy_profile). This is the one place a
    Starlink session is actually and irreversibly destroyed - closing the
    STAR NET app or signing out of it never does this."""
    account = get_owned_account_or_404(db, identity, account_id)
    from app.browser.manager import get_browser_manager  # local import: avoid cycle

    get_browser_manager().destroy_profile(db, account)
    audit.record(
        db,
        action="account_deleted",
        user_id=identity.user.id,
        device_id=identity.device.id,
        account_id=account.id,
        ip_address=request.client.host if request.client else "",
    )
    db.delete(account)
    db.commit()
    return {"deleted": True}
