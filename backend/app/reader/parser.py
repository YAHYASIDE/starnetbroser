"""Read-only Starlink account page parser.

Takes the RENDERED page HTML (i.e. `page.content()` after Playwright has let
the SPA finish rendering - this module never sees a browser itself) plus an
optional pre-computed dish/Wi‑Fi status (see app/browser/status_probe.py,
which reads the colored status dots via a live page since that needs
computed CSS, something a static-HTML parser cannot see), and extracts only
the specific fields STAR NET needs. It never returns or stores the full page
text - only the matched field values.

Supports Arabic, English and French label text. Matching is deliberately
NOT selector-based (no reliance on one CSS class or id, which breaks the
moment Starlink redeploys their frontend) - it works off visible text lines
and a few structured-token regexes (KIT-..., SL-..., ACC-..., amounts,
dates) that are far more stable than markup.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, fields

from bs4 import BeautifulSoup

_WHITESPACE_RE = re.compile(r"\s+")


@dataclass
class ReadResult:
    balance_due: str = ""
    currency: str = ""
    standby_date: str = ""
    kit_number: str = ""
    serial_number: str = ""
    subscription_id: str = ""
    account_number: str = ""
    starlink_id: str = ""
    device_name: str = ""
    dish_status: str = "UNKNOWN"
    wifi_status: str = "UNKNOWN"
    alert_reason: str = ""
    last_updated: str = ""
    plan_name: str = ""
    service_status: str = ""
    service_location: str = ""
    billing_period: str = ""
    payment_due_date: str = ""
    software_version: str = ""
    uptime: str = ""
    fields_found: list[str] | None = None

    def has_any_data(self) -> bool:
        skip = {"currency", "dish_status", "wifi_status", "fields_found"}
        for f in fields(self):
            if f.name in skip:
                continue
            if getattr(self, f.name):
                return True
        return self.dish_status != "UNKNOWN" or self.wifi_status != "UNKNOWN"


def _clean(text: str) -> str:
    return _WHITESPACE_RE.sub(" ", text or "").strip()


def _visible_lines(html: str) -> list[str]:
    soup = BeautifulSoup(html, "lxml")
    for tag in soup(["script", "style", "noscript", "template"]):
        tag.decompose()
    raw = soup.get_text("\n")
    return [_clean(line) for line in raw.split("\n") if _clean(line)]


# label -> canonical field, one entry per language. Matched as an exact
# (case-insensitive) line, then the next non-boilerplate line within
# `look_ahead` lines is taken as the value.
_LABELS: dict[str, list[str]] = {
    "device_name": ["nickname", "الاسم المستعار", "اسم الجهاز", "surnom", "nom de l'appareil"],
    "starlink_id": ["starlink id", "معرف starlink", "معرف الجهاز", "identifiant starlink"],
    "last_updated": ["last updated", "آخر تحديث", "dernière mise à jour"],
    "service_location": ["service location", "موقع الخدمة", "emplacement du service"],
    "software_version": ["software version", "إصدار البرنامج", "version du logiciel"],
    "uptime": ["uptime", "مدة التشغيل", "durée de fonctionnement"],
    "serial_number_label": ["الرقم التسلسلي", "numéro de série"],
    "payment_due_date_label": ["تاريخ استحقاق الدفع", "date d'échéance du paiement"],
}

_SKIP_VALUE_LINES = re.compile(
    r"^(copy|edit|manage|pay|learn more|نسخ|تعديل|إدارة|دفع|copier|modifier|gérer|payer)$",
    re.IGNORECASE,
)

_PLAN_LABELS = re.compile(r"^(service plan|plan|خطة الخدمة|forfait)$", re.IGNORECASE)
_PLAN_SKIP = re.compile(
    r"^(manage|إدارة|gérer|active|online|offline|suspended|standby mode pending|standby|"
    r"نشط|غير متصل|actif|en ligne|hors ligne)$",
    re.IGNORECASE,
)

_SERVICE_STATE_RE = re.compile(
    r"\b(Standby Mode Pending|Standby Mode|Suspended|Offline|Online|Active|Rebooting|Disconnected)\b",
    re.IGNORECASE,
)

_ALERT_RE = re.compile(
    r"(offline|standby|suspend|thermal|temperature|obstruct|disconnect|reboot|fault|outage|"
    r"حرارة|غير متصل|عطل|حجب|استعداد|"
    r"panne|hors ligne|surchauffe|obstru|déconnect|redémarr)",
    re.IGNORECASE,
)

_BALANCE_PATTERNS = [
    re.compile(r"Balance\s*Due[\s:]*([$€£]?)\s*([\d.,]+)", re.IGNORECASE),
    re.compile(r"الرصيد\s*المستحق[\s:]*([$€£]?)\s*([\d.,]+)", re.IGNORECASE),
    re.compile(r"Solde\s*[dD]û[\s:]*([$€£]?)\s*([\d.,]+)", re.IGNORECASE),
]

_KIT_RE = re.compile(r"\b(KIT[A-Z0-9-]{8,})\b", re.IGNORECASE)
_SERIAL_RE = re.compile(r"Serial\s+Number[\s:]*([A-Z0-9-]{7,})", re.IGNORECASE)
_SUBSCRIPTION_RE = re.compile(r"\b(SL-[A-Z]{2}-[\d-]+)\b", re.IGNORECASE)
_ACCOUNT_RE = re.compile(r"\b(ACC-[\d-]+)\b", re.IGNORECASE)
_STARLINK_ID_RE = re.compile(r"(\d{6,}-\d{6,}-[a-f0-9]{8})", re.IGNORECASE)
_STANDBY_DATE_RE = re.compile(
    r"switch\s+to\s+Standby\s+Mode\s+on\s+([A-Za-z0-9,\-/ ]+?)(?:\.|\n|$)", re.IGNORECASE
)
_PAYMENT_DUE_RE = re.compile(r"Payment\s+due\s+([A-Za-z0-9,\-/ ]+?)(?:\.|\n|$)", re.IGNORECASE)
_BILLING_PERIOD_RE = re.compile(
    r"Your\s+billing\s+period\s+is\s+([^\n.]+(?:\.[^\n.]+)?)", re.IGNORECASE
)


def _after_label(lines: list[str], labels: list[str], look_ahead: int) -> str:
    lowered = [line.lower() for line in lines]
    label_set = {label.lower() for label in labels}
    index = next((i for i, line in enumerate(lowered) if line in label_set), None)
    if index is None:
        return ""
    for i in range(index + 1, min(len(lines), index + 1 + look_ahead)):
        candidate = lines[i]
        if not _SKIP_VALUE_LINES.match(candidate) and len(candidate) <= 220:
            return candidate
    return ""


def _plan_after_label(lines: list[str]) -> str:
    index = next((i for i, line in enumerate(lines) if _PLAN_LABELS.match(line)), None)
    if index is None:
        return ""
    for i in range(index + 1, min(len(lines), index + 8)):
        candidate = lines[i]
        if not _PLAN_SKIP.match(candidate) and len(candidate) <= 120:
            return candidate
    return ""


def parse(html: str, *, dish_status: str = "UNKNOWN", wifi_status: str = "UNKNOWN") -> ReadResult:
    lines = _visible_lines(html)
    text = "\n".join(lines)
    found: list[str] = []

    def track(name: str, value: str) -> str:
        if value:
            found.append(name)
        return value

    balance_due = ""
    currency = ""
    for pattern in _BALANCE_PATTERNS:
        m = pattern.search(text)
        if m:
            currency = m.group(1) or ""
            balance_due = _clean(m.group(2))
            break

    alert_reason = ""
    for line in lines:
        if 8 <= len(line) <= 250 and _ALERT_RE.search(line):
            alert_reason = line
            break

    if dish_status == "UNKNOWN" and re.search(r"offline|disconnected|غير متصل|hors ligne", alert_reason, re.IGNORECASE):
        dish_status = "RED"

    serial = ""
    m = _SERIAL_RE.search(text)
    if m:
        serial = _clean(m.group(1))
    else:
        serial = _after_label(lines, _LABELS["serial_number_label"], 3)

    payment_due = ""
    m = _PAYMENT_DUE_RE.search(text)
    if m:
        payment_due = _clean(m.group(1))
    else:
        payment_due = _after_label(lines, _LABELS["payment_due_date_label"], 3)

    m_standby = _STANDBY_DATE_RE.search(text)
    m_kit = _KIT_RE.search(text)
    m_sub = _SUBSCRIPTION_RE.search(text)
    m_acc = _ACCOUNT_RE.search(text)
    m_billing = _BILLING_PERIOD_RE.search(text)

    starlink_id = _after_label(lines, _LABELS["starlink_id"], 3)
    if not starlink_id:
        m_sid = _STARLINK_ID_RE.search(text)
        starlink_id = _clean(m_sid.group(1)) if m_sid else ""

    service_state_m = _SERVICE_STATE_RE.search(text)

    result = ReadResult(
        balance_due=track("balance_due", balance_due),
        currency=currency,
        standby_date=track("standby_date", _clean(m_standby.group(1)) if m_standby else ""),
        kit_number=track("kit_number", _clean(m_kit.group(1)) if m_kit else ""),
        serial_number=track("serial_number", serial),
        subscription_id=track("subscription_id", _clean(m_sub.group(1)) if m_sub else ""),
        account_number=track("account_number", _clean(m_acc.group(1)) if m_acc else ""),
        starlink_id=track("starlink_id", starlink_id),
        device_name=track("device_name", _after_label(lines, _LABELS["device_name"], 4)),
        dish_status=dish_status,
        wifi_status=wifi_status,
        alert_reason=track("alert_reason", alert_reason),
        last_updated=track("last_updated", _after_label(lines, _LABELS["last_updated"], 3)),
        plan_name=track("plan_name", _plan_after_label(lines)),
        service_status=_clean(service_state_m.group(1)) if service_state_m else "",
        service_location=track("service_location", _after_label(lines, _LABELS["service_location"], 4)),
        billing_period=track("billing_period", _clean(m_billing.group(1)) if m_billing else ""),
        payment_due_date=track("payment_due_date", payment_due),
        software_version=track("software_version", _after_label(lines, _LABELS["software_version"], 3)),
        uptime=track("uptime", _after_label(lines, _LABELS["uptime"], 3)),
        fields_found=found,
    )
    return result
