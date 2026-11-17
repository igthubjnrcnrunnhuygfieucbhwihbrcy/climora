from src.registrar.security import create_token, decode_token, hash_password, verify_password
from src.registrar.tlds import ALL_TLDS, get_tld, split_domain


def test_password_hash_roundtrip():
    stored = hash_password("wachtwoord123")
    assert stored != "wachtwoord123"
    assert verify_password("wachtwoord123", stored)
    assert not verify_password("verkeerd", stored)


def test_token_roundtrip():
    token = create_token(42)
    assert decode_token(token) == 42
    assert decode_token(token + "x") is None
    assert decode_token("garbage") is None


def test_tld_catalog_has_popular_tlds():
    tlds = {info.tld for info in ALL_TLDS}
    for expected in ["nl", "com", "it", "de", "eu", "ai", "io", "fr", "es", "be"]:
        assert expected in tlds
    assert len(tlds) >= 200


def test_all_prices_are_free():
    assert all(info.price == 0.0 for info in ALL_TLDS)


def test_get_tld_and_split():
    assert get_tld("nl").category == "country"
    assert get_tld(".NL").tld == "nl"
    assert split_domain("Voorbeeld.NL") == ("voorbeeld", "nl")
    assert split_domain("zonderpunt") is None
