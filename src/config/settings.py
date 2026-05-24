from functools import lru_cache

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "Climora Atmos Core"
    app_version: str = "0.1.0"
    debug: bool = False

    # Database
    database_url: str = "postgresql+asyncpg://climora:climora@localhost:5432/climora"
    database_sync_url: str = "postgresql://climora:climora@localhost:5432/climora"

    # Redis
    redis_url: str = "redis://localhost:6379/0"
    cache_ttl_current: int = 300  # 5 minutes
    cache_ttl_hourly: int = 900  # 15 minutes
    cache_ttl_daily: int = 3600  # 1 hour

    # Open-Meteo
    openmeteo_base_url: str = "https://api.open-meteo.com/v1"

    # KNMI
    knmi_base_url: str = "https://api.dataplatform.knmi.nl/open-data/v1"
    knmi_api_key: str = ""

    # Meteostat
    meteostat_api_key: str = ""

    # Location defaults (Almelo, NL)
    default_latitude: float = 52.3567
    default_longitude: float = 6.6683
    default_location_name: str = "Almelo"

    # Local station
    local_station_url: str = ""
    local_station_enabled: bool = False

    # Model settings
    model_dir: str = "models"
    bias_correction_enabled: bool = True
    confidence_model_enabled: bool = True

    # Collector schedule (cron-like intervals in minutes)
    collector_interval_openmeteo: int = 15
    collector_interval_knmi: int = 60
    collector_interval_local: int = 5

    model_config = {"env_file": ".env", "env_prefix": "CLIMORA_"}


@lru_cache
def get_settings() -> Settings:
    return Settings()
