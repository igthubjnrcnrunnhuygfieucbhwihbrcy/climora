def _add(client, headers, name, **overrides):
    payload = {"record_type": "A", "name": "@", "value": "192.0.2.1", "ttl": 3600}
    payload.update(overrides)
    return client.post(f"/api/v1/domains/{name}/dns", json=payload, headers=headers)


def test_dns_crud(client, auth_headers, find_available):
    name = find_available("dnstest456")
    client.post(f"/api/v1/domains/register/{name}", headers=auth_headers)

    res = _add(client, auth_headers, name)
    assert res.status_code == 201, res.text
    record_id = res.json()["id"]

    res = client.get(f"/api/v1/domains/{name}/dns", headers=auth_headers)
    assert res.status_code == 200
    assert len(res.json()) == 1

    res = client.put(
        f"/api/v1/domains/{name}/dns/{record_id}",
        json={"record_type": "A", "name": "www", "value": "192.0.2.2", "ttl": 600},
        headers=auth_headers,
    )
    assert res.status_code == 200
    assert res.json()["value"] == "192.0.2.2"

    res = client.delete(f"/api/v1/domains/{name}/dns/{record_id}", headers=auth_headers)
    assert res.status_code == 204
    assert len(client.get(f"/api/v1/domains/{name}/dns", headers=auth_headers).json()) == 0


def test_mx_requires_priority(client, auth_headers, find_available):
    name = find_available("mxtest789")
    client.post(f"/api/v1/domains/register/{name}", headers=auth_headers)
    res = _add(client, auth_headers, name, record_type="MX", value="mail.example.com")
    assert res.status_code == 400

    res = _add(
        client, auth_headers, name,
        record_type="MX", value="mail.example.com", priority=10,
    )
    assert res.status_code == 201


def test_invalid_record_type_rejected(client, auth_headers, find_available):
    name = find_available("badtype123")
    client.post(f"/api/v1/domains/register/{name}", headers=auth_headers)
    res = _add(client, auth_headers, name, record_type="BOGUS")
    assert res.status_code == 422


def test_dns_of_other_user_hidden(client, auth_headers, find_available):
    name = find_available("verborgen123")
    client.post(f"/api/v1/domains/register/{name}", headers=auth_headers)
    _add(client, auth_headers, name)
    res = client.post(
        "/api/v1/auth/register",
        json={"email": "dnsander@example.com", "password": "wachtwoord123"},
    )
    other = {"Authorization": f"Bearer {res.json()['access_token']}"}
    res = client.get(f"/api/v1/domains/{name}/dns", headers=other)
    assert res.status_code == 404
