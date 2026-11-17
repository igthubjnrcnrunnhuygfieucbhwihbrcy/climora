from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
import time

from .config import settings

PBKDF2_ITERATIONS = 240_000


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), bytes.fromhex(salt), PBKDF2_ITERATIONS
    ).hex()
    return f"pbkdf2${PBKDF2_ITERATIONS}${salt}${digest}"


def verify_password(password: str, stored: str) -> bool:
    try:
        _, iterations, salt, digest = stored.split("$")
        candidate = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            bytes.fromhex(salt),
            int(iterations),
        ).hex()
        return hmac.compare_digest(candidate, digest)
    except (ValueError, TypeError):
        return False


def _sign(payload: bytes) -> str:
    return hmac.new(settings.token_secret.encode("utf-8"), payload, hashlib.sha256).hexdigest()


def create_token(user_id: int) -> str:
    payload = json.dumps(
        {"sub": user_id, "exp": int(time.time()) + settings.token_ttl_seconds}
    ).encode("utf-8")
    encoded = base64.urlsafe_b64encode(payload).decode("ascii").rstrip("=")
    return f"{encoded}.{_sign(payload)}"


def decode_token(token: str) -> int | None:
    try:
        encoded, signature = token.rsplit(".", 1)
        payload = base64.urlsafe_b64decode(encoded + "=" * (-len(encoded) % 4))
        if not hmac.compare_digest(_sign(payload), signature):
            return None
        data = json.loads(payload)
        if data.get("exp", 0) < time.time():
            return None
        return int(data["sub"])
    except (ValueError, TypeError, KeyError, json.JSONDecodeError):
        return None
