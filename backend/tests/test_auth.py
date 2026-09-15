import pyotp

from app.security import get_vault


def test_register_then_use_protected_endpoint(client):
    resp = client.post(
        "/auth/register",
        json={"email": "a@example.com", "password": "correct-horse-battery", "device_name": "Phone A"},
    )
    assert resp.status_code == 201
    token = resp.json()["access_token"]

    listing = client.get("/accounts", headers={"Authorization": f"Bearer {token}"})
    assert listing.status_code == 200
    assert listing.json() == []


def test_protected_endpoint_rejects_missing_token(client):
    resp = client.get("/accounts")
    assert resp.status_code == 401


def test_login_wrong_password_rejected(client):
    client.post("/auth/register", json={"email": "b@example.com", "password": "correct-horse-battery"})
    resp = client.post("/auth/login", json={"email": "b@example.com", "password": "wrong-password"})
    assert resp.status_code == 401


def test_login_success_issues_new_device(client):
    client.post("/auth/register", json={"email": "c@example.com", "password": "correct-horse-battery"})
    resp = client.post(
        "/auth/login",
        json={"email": "c@example.com", "password": "correct-horse-battery", "device_name": "Phone B"},
    )
    assert resp.status_code == 200
    assert "access_token" in resp.json()


def test_totp_enroll_and_required_on_login(client, registered_user, auth_headers):
    enroll = client.post("/auth/totp/enroll", headers=auth_headers)
    assert enroll.status_code == 200
    secret = enroll.json()["secret"]

    code = pyotp.TOTP(secret).now()
    verify = client.post("/auth/totp/verify", json={"code": code}, headers=auth_headers)
    assert verify.status_code == 200
    assert verify.json()["totp_enabled"] is True

    # Login now requires the code.
    no_code = client.post(
        "/auth/login", json={"email": "operator@example.com", "password": "correct-horse-battery"}
    )
    assert no_code.status_code == 401
    assert "totp_required" in no_code.json()["detail"]

    with_code = client.post(
        "/auth/login",
        json={
            "email": "operator@example.com",
            "password": "correct-horse-battery",
            "totp_code": pyotp.TOTP(secret).now(),
        },
    )
    assert with_code.status_code == 200


def test_refresh_rotates_token_and_old_one_becomes_invalid(client, registered_user):
    refresh_token = registered_user["refresh_token"]
    first = client.post("/auth/refresh", json={"refresh_token": refresh_token})
    assert first.status_code == 200
    new_refresh = first.json()["refresh_token"]
    assert new_refresh != refresh_token

    # Reusing the OLD refresh token must fail (rotation).
    replay = client.post("/auth/refresh", json={"refresh_token": refresh_token})
    assert replay.status_code == 401

    # And it must have force-revoked the whole device: the token issued by
    # the successful rotation above should now ALSO be dead, because reuse
    # detection kills the entire device chain.
    second = client.post("/auth/refresh", json={"refresh_token": new_refresh})
    assert second.status_code == 401


def test_device_list_and_revoke(client, registered_user, auth_headers):
    # log in from a second device
    client.post(
        "/auth/login",
        json={"email": "operator@example.com", "password": "correct-horse-battery", "device_name": "Phone B"},
    )
    devices = client.get("/auth/devices", headers=auth_headers).json()
    assert len(devices) == 2

    other_device = next(d for d in devices if not d["is_current"])
    revoke = client.delete(f"/auth/devices/{other_device['id']}", headers=auth_headers)
    assert revoke.status_code == 200

    devices_after = client.get("/auth/devices", headers=auth_headers).json()
    assert len(devices_after) == 1


def test_logout_all_revokes_current_device_too(client, registered_user, auth_headers):
    resp = client.post("/auth/logout-all", headers=auth_headers)
    assert resp.status_code == 200

    # The now-revoked device's access token must be rejected on the next call.
    listing = client.get("/accounts", headers=auth_headers)
    assert listing.status_code == 401


def test_vault_roundtrip_for_totp_secret_never_stores_plaintext(db, client, registered_user, auth_headers):
    client.post("/auth/totp/enroll", headers=auth_headers)
    from app.models import User

    user = db.query(User).filter(User.email == "operator@example.com").first()
    assert user.totp_secret_encrypted
    assert "JBSW" not in user.totp_secret_encrypted  # not a plausible plaintext base32 secret prefix leak
    decrypted = get_vault().decrypt(user.totp_secret_encrypted)
    assert len(decrypted) >= 16  # a real base32 TOTP secret
