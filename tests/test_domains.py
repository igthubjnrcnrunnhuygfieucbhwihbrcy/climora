def test_search_returns_results(client):
    res = client.get("/api/v1/domains/search", params={"q": "voorbeeldbedrijf2025", "limit": 10})
    assert res.status_code == 200
    data = res.json()
    assert data["query"] == "voorbeeldbedrijf2025"
    assert 1 <= len(data["results"]) <= 10
    for hit in data["results"]:
        assert hit["price"] == 0.0
        assert hit["domain"].startswith("voorbeeldbedrijf2025.")


def test_search_specific_tld(client):
    res = client.get("/api/v1/domains/search", params={"q": "voorbeeldbedrijf2025.nl"})
    assert res.status_code == 200
    hits = res.json()["results"]
    assert len(hits) == 1
    assert hits[0]["tld"] == "nl"


def test_search_invalid_tld(client):
    res = client.get("/api/v1/domains/search", params={"q": "voorbeeld.nietbestaandtld"})
    assert res.status_code == 400


def test_search_invalid_label(client):
    res = client.get("/api/v1/domains/search", params={"q": "-ongeldig-"})
    assert res.status_code == 400


def test_search_idn(client):
    res = client.get("/api/v1/domains/search", params={"q": "münchen.nl"})
    assert res.status_code == 200
    assert res.json()["query"] == "xn--mnchen-3ya"


def test_register_domain_and_duplicate(client, auth_headers, find_available):
    name = find_available("gratisdomeintest123")
    res = client.post(f"/api/v1/domains/register/{name}", headers=auth_headers)
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["name"] == name
    assert body["status"] == "active"

    res = client.post(f"/api/v1/domains/register/{name}", headers=auth_headers)
    assert res.status_code == 409


def test_register_requires_auth(client):
    res = client.post("/api/v1/domains/register/gratisdomein123.nl")
    assert res.status_code == 401


def test_register_reserved_name(client, auth_headers, find_available):
    res = client.post("/api/v1/domains/register/google.nl", headers=auth_headers)
    assert res.status_code == 409


def test_register_restricted_tld_blocked(client, auth_headers, find_available):
    res = client.post("/api/v1/domains/register/voorbeeldtst2025.au", headers=auth_headers)
    assert res.status_code == 403


def test_register_without_tld_rejected(client, auth_headers, find_available):
    res = client.post("/api/v1/domains/register/alleenlabel", headers=auth_headers)
    assert res.status_code == 400


def test_mine_and_detail(client, auth_headers, find_available):
    name = find_available("mijndomeintest9")
    client.post(f"/api/v1/domains/register/{name}", headers=auth_headers)
    res = client.get("/api/v1/domains/mine", headers=auth_headers)
    assert res.status_code == 200
    names = [d["name"] for d in res.json()]
    assert name in names

    res = client.get(f"/api/v1/domains/{name}", headers=auth_headers)
    assert res.status_code == 200
    assert res.json()["name"] == name


def test_detail_of_other_user_hidden(client, auth_headers, find_available):
    name = find_available("privatedomein7")
    client.post(f"/api/v1/domains/register/{name}", headers=auth_headers)
    res = client.post(
        "/api/v1/auth/register",
        json={"email": "ander@example.com", "password": "wachtwoord123"},
    )
    other = {"Authorization": f"Bearer {res.json()['access_token']}"}
    res = client.get(f"/api/v1/domains/{name}", headers=other)
    assert res.status_code == 404


def test_renew_extends_expiry(client, auth_headers, find_available):
    name = find_available("verlengmij123")
    client.post(f"/api/v1/domains/register/{name}", headers=auth_headers)
    before = client.get(f"/api/v1/domains/{name}", headers=auth_headers).json()["expires_at"]
    res = client.post(f"/api/v1/domains/{name}/renew", headers=auth_headers)
    assert res.status_code == 200
    after = res.json()["expires_at"]
    assert after > before


def test_nameservers_update(client, auth_headers, find_available):
    name = find_available("nstest123")
    client.post(f"/api/v1/domains/register/{name}", headers=auth_headers)
    res = client.put(
        f"/api/v1/domains/{name}/nameservers",
        json={"nameservers": ["ns1.example.com", "ns2.example.com"]},
        headers=auth_headers,
    )
    assert res.status_code == 200
    assert "ns1.example.com" in res.json()["nameservers"]


def test_release_domain(client, auth_headers, find_available):
    name = find_available("vrijgeven123")
    client.post(f"/api/v1/domains/register/{name}", headers=auth_headers)
    res = client.delete(f"/api/v1/domains/{name}", headers=auth_headers)
    assert res.status_code == 204
    res = client.get(f"/api/v1/domains/{name}", headers=auth_headers)
    assert res.status_code == 404
