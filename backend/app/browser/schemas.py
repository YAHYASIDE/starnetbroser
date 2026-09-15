from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class BrowserStatus(BaseModel):
    status: str
    last_started_at: datetime | None
    last_stopped_at: datetime | None
    last_activity_at: datetime | None


class VncTicketResponse(BaseModel):
    ticket: str
    expires_in_seconds: int


class ScanResult(BaseModel):
    reachable: bool
    fields_found: list[str] = []
    message: str
