"""Proves account A's owner can never see or touch account B's data, even
with a crafted request that knows B's account id."""


def _register(client, email):
    resp = client.post("/auth/register", json={"email": email, "password": "correct-horse-battery"})
    assert resp.status_code == 201
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


def test_two_operators_cannot_see_each_others_accounts(client):
    headers_a = _register(client, "opA@example.com")
    headers_b = _register(client, "opB@example.com")

    created = client.post(
        "/accounts",
        json={"name": "Client Window 1", "email": "clientA@mail.com", "email_secret": "secretA"},
        headers=headers_a,
    )
    assert created.status_code == 201
    account_a_id = created.json()["id"]

    # B's list is empty - never sees A's account.
    listing_b = client.get("/accounts", headers=headers_b)
    assert listing_b.json() == []

    # B directly requesting A's account id by GET -> 404, not 403 (existence
    # is not leaked either).
    direct_get = client.get(f"/accounts/{account_a_id}", headers=headers_b)
    assert direct_get.status_code == 404

    # B cannot update A's account.
    direct_update = client.put(
        f"/accounts/{account_a_id}",
        json={"name": "hijacked"},
        headers=headers_b,
    )
    assert direct_update.status_code == 404

    # B cannot delete A's account.
    direct_delete = client.delete(f"/accounts/{account_a_id}", headers=headers_b)
    assert direct_delete.status_code == 404

    # A still sees their own account, untouched.
    still_there = client.get(f"/accounts/{account_a_id}", headers=headers_a)
    assert still_there.status_code == 200
    assert still_there.json()["name"] == "Client Window 1"
    assert still_there.json()["email_secret"] == "secretA"


def test_account_secrets_are_encrypted_at_rest(client, db):
    headers = _register(client, "opC@example.com")
    client.post(
        "/accounts",
        json={"name": "W1", "email": "c@mail.com", "email_secret": "superSecretPW123", "wifi_code": "wifi123"},
        headers=headers,
    )
    from app.models import StarlinkAccount

    row = db.query(StarlinkAccount).filter(StarlinkAccount.name == "W1").one()
    assert "superSecretPW123" not in row.email_secret_encrypted
    assert "wifi123" not in row.wifi_code_encrypted
    assert row.email_secret_encrypted != ""


def test_list_view_never_includes_decrypted_secrets(client):
    headers = _register(client, "opD@example.com")
    client.post(
        "/accounts",
        json={"name": "W2", "email": "d@mail.com", "email_secret": "shouldNotLeak"},
        headers=headers,
    )
    listing = client.get("/accounts", headers=headers)
    assert listing.status_code == 200
    body = listing.json()
    assert len(body) == 1
    assert "email_secret" not in body[0]
    assert "shouldNotLeak" not in str(body)
