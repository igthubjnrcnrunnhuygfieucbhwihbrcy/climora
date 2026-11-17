import os
import tempfile

_tmpdir = tempfile.mkdtemp()
os.environ["DATABASE_URL"] = f"sqlite:///{_tmpdir}/test.db"
os.environ["TOKEN_SECRET"] = "test-secret"

import pytest
from fastapi.testclient import TestClient

from src.registrar.database import init_db
from src.registrar.main import app


@pytest.fixture(scope="session", autouse=True)
def _init_db():
    init_db()


@pytest.fixture()
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture()
def find_available(client):
    def _find(base):
        res = client.get("/api/v1/domains/search", params={"q": base, "limit": 100})
        assert res.status_code == 200
        for hit in res.json()["results"]:
            if hit["available"] and hit["restriction"] == "none":
                return hit["domain"]
        pytest.fail(f"geen beschikbaar domein voor '{base}'")

    return _find


@pytest.fixture()
def auth_headers(client):
    email = f"user{os.urandom(4).hex()}@example.com"
    res = client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "supersecret123", "name": "Tester"},
    )
    assert res.status_code == 201, res.text
    token = res.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}
