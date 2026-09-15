from pathlib import Path

from app.reader.parser import parse

FIXTURES = Path(__file__).parent / "fixtures"


def _load(name: str) -> str:
    return (FIXTURES / name).read_text(encoding="utf-8")


def test_parses_english_account_page():
    result = parse(_load("account_en.html"))
    assert result.balance_due == "0.00"
    assert result.kit_number == "KIT-AB12CD34EF"
    assert result.serial_number == "SNXA12345678"
    assert result.account_number == "ACC-2026-000123"
    assert result.subscription_id == "SL-US-2026-000456"
    assert result.starlink_id == "123456789012-987654321098-ab12cd34"
    assert result.standby_date == "10/13/2026"
    assert result.payment_due_date == "10/05/2026"
    assert result.device_name == "Living Room Dish"
    assert result.software_version == "2026.09.1"
    assert result.uptime == "14 days"
    assert result.service_location == "Cairo, Egypt"
    assert result.plan_name == "Residential Priority"
    assert result.billing_period == "Sep 1 - Sep 30"
    assert result.has_any_data()


def test_parses_arabic_account_page():
    result = parse(_load("account_ar.html"))
    assert result.balance_due == "0.00"
    assert result.kit_number == "KIT-ZZ99YY88XX"
    assert result.serial_number == "SNXB87654321"
    assert result.account_number == "ACC-2026-000999"
    assert result.subscription_id == "SL-EG-2026-000111"
    assert result.device_name == "طبق غرفة الجلوس"
    assert result.plan_name == "خطة سكنية أولوية"
    assert result.software_version == "2026.08.3"
    assert result.uptime == "30 يوم"
    assert result.payment_due_date == "2026/10/20"
    assert "استعداد" in result.alert_reason
    assert result.has_any_data()


def test_parses_french_account_page():
    result = parse(_load("account_fr.html"))
    assert result.balance_due == "0.00"
    assert result.kit_number == "KIT-FR55GG66HH"
    assert result.serial_number == "SNXC11223344"
    assert result.account_number == "ACC-2026-000777"
    assert result.subscription_id == "SL-FR-2026-000222"
    assert result.device_name == "Antenne Salon"
    assert result.software_version == "2026.07.2"
    assert result.uptime == "5 jours"
    assert "température" in result.alert_reason or "Panne" in result.alert_reason
    assert result.has_any_data()


def test_empty_page_is_safe():
    result = parse("<html><body>random unrelated content</body></html>")
    assert not result.has_any_data()
    assert result.balance_due == ""
    assert result.dish_status == "UNKNOWN"


def test_dish_status_defaults_to_unknown_without_live_page():
    # Color-dot detection needs a live rendered page (see
    # app/browser/status_probe.py) - the static-HTML parser must never guess.
    result = parse(_load("account_en.html"))
    assert result.dish_status == "UNKNOWN"
    assert result.wifi_status == "UNKNOWN"


def test_dish_status_passthrough_from_caller():
    result = parse(_load("account_en.html"), dish_status="GREEN", wifi_status="RED")
    assert result.dish_status == "GREEN"
    assert result.wifi_status == "RED"
