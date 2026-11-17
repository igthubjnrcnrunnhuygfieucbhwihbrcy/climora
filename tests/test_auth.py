def test_register_and_me(client):
    res = client.post(
        "/api/v1/auth/register",
        json={"email": "test@example.com", "password": "wachtwoord123", "name": "Test"},
    )
    assert res.status_code == 201
    data = res.json()
    assert data["user"]["email"] == "test@example.com"
    assert "access_token" in data

    res = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {data['access_token']}"})
    assert res.status_code == 200
    assert res.json()["email"] == "test@example.com"


def test_register_duplicate_email(client):
    for _ in range(2):
        res = client.post(
            "/api/v1/auth/register",
            json={"email": "dup@example.com", "password": "wachtwoord123"},
        )
    assert res.status_code == 409


def test_login_wrong_password(client):
    client.post(
        "/api/v1/auth/register",
        json={"email": "login@example.com", "password": "wachtwoord123"},
    )
    res = client.post(
        "/api/v1/auth/login",
        json={"email": "login@example.com", "password": "verkeerd123"},
    )
    assert res.status_code == 401


def test_short_password_rejected(client):
    res = client.post(
        "/api/v1/auth/register",
        json={"email": "short@example.com", "password": "kort"},
    )
    assert res.status_code == 422


def test_me_requires_auth(client):
    res = client.get("/api/v1/auth/me")
    assert res.status_code == 401
