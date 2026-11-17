import os


class Settings:
    app_name: str = "Climora Registrar"
    database_url: str = os.environ.get("DATABASE_URL", "sqlite:///./registrar.db")
    token_secret: str = os.environ.get("TOKEN_SECRET", "dev-only-change-me")
    token_ttl_seconds: int = int(os.environ.get("TOKEN_TTL_SECONDS", str(60 * 60 * 24 * 7)))
    default_nameservers: list[str] = [
        "ns1.climora.registrar",
        "ns2.climora.registrar",
    ]


settings = Settings()
