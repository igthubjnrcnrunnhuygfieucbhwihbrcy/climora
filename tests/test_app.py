def test_health(client):
    res = client.get("/api/v1/health")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"
    assert res.json()["tlds"] >= 200


def test_tlds_endpoint(client):
    res = client.get("/api/v1/tlds")
    assert res.status_code == 200
    tlds = {entry["tld"] for entry in res.json()}
    assert {"nl", "com", "it"} <= tlds


def test_index_served(client):
    res = client.get("/")
    assert res.status_code == 200
    assert "Climora Registrar" in res.text
