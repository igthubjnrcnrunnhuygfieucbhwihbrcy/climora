import datetime
import json

from src.collectors.base import BaseCollector
from src.config.settings import get_settings
from src.db.models import WeatherObservation

settings = get_settings()

HOURLY_VARIABLES = [
    "temperature_2m",
    "relative_humidity_2m",
    "apparent_temperature",
    "pressure_msl",
    "cloud_cover",
    "wind_speed_10m",
    "wind_direction_10m",
    "wind_gusts_10m",
    "precipitation",
    "weather_code",
    "dew_point_2m",
    "visibility",
    "uv_index",
    "direct_radiation",
]


class OpenMeteoCollector(BaseCollector):
    """Collect current and forecast weather from Open-Meteo (free, no API key)."""

    source_name = "openmeteo"

    async def fetch(
        self, latitude: float, longitude: float
    ) -> list[WeatherObservation]:
        data = await self._get(
            f"{settings.openmeteo_base_url}/forecast",
            params={
                "latitude": latitude,
                "longitude": longitude,
                "hourly": ",".join(HOURLY_VARIABLES),
                "current": ",".join(HOURLY_VARIABLES),
                "timezone": "UTC",
                "forecast_days": 16,
            },
        )
        return self._parse_response(data, latitude, longitude)

    async def fetch_historical(
        self,
        latitude: float,
        longitude: float,
        start_date: str,
        end_date: str,
    ) -> list[WeatherObservation]:
        """Fetch historical data from Open-Meteo archive."""
        data = await self._get(
            f"{settings.openmeteo_base_url.replace('/v1', '')}/v1/archive",
            params={
                "latitude": latitude,
                "longitude": longitude,
                "start_date": start_date,
                "end_date": end_date,
                "hourly": ",".join(HOURLY_VARIABLES[:10]),
                "timezone": "UTC",
            },
        )
        return self._parse_response(data, latitude, longitude)

    def _parse_response(
        self, data: dict, latitude: float, longitude: float
    ) -> list[WeatherObservation]:
        observations: list[WeatherObservation] = []
        now = self._utcnow()

        if "current" in data:
            current = data["current"]
            observations.append(
                WeatherObservation(
                    timestamp=datetime.datetime.fromisoformat(current["time"]).replace(
                        tzinfo=datetime.UTC
                    ),
                    source=self.source_name,
                    latitude=latitude,
                    longitude=longitude,
                    location_name=settings.default_location_name,
                    temperature_c=current.get("temperature_2m"),
                    humidity_pct=current.get("relative_humidity_2m"),
                    feels_like_c=current.get("apparent_temperature"),
                    pressure_hpa=current.get("pressure_msl"),
                    cloud_cover_pct=current.get("cloud_cover"),
                    wind_speed_ms=current.get("wind_speed_10m"),
                    wind_direction_deg=current.get("wind_direction_10m"),
                    wind_gust_ms=current.get("wind_gusts_10m"),
                    precipitation_mm=current.get("precipitation"),
                    weather_code=current.get("weather_code"),
                    dew_point_c=current.get("dew_point_2m"),
                    visibility_m=current.get("visibility"),
                    uv_index=current.get("uv_index"),
                    solar_radiation_wm2=current.get("direct_radiation"),
                    raw_data=json.dumps(current),
                    ingested_at=now,
                )
            )

        if "hourly" in data:
            hourly = data["hourly"]
            times = hourly.get("time", [])
            for i, time_str in enumerate(times):
                ts = datetime.datetime.fromisoformat(time_str).replace(
                    tzinfo=datetime.UTC
                )
                observations.append(
                    WeatherObservation(
                        timestamp=ts,
                        source=self.source_name,
                        latitude=latitude,
                        longitude=longitude,
                        location_name=settings.default_location_name,
                        temperature_c=_safe_idx(hourly, "temperature_2m", i),
                        humidity_pct=_safe_idx(hourly, "relative_humidity_2m", i),
                        feels_like_c=_safe_idx(hourly, "apparent_temperature", i),
                        pressure_hpa=_safe_idx(hourly, "pressure_msl", i),
                        cloud_cover_pct=_safe_idx(hourly, "cloud_cover", i),
                        wind_speed_ms=_safe_idx(hourly, "wind_speed_10m", i),
                        wind_direction_deg=_safe_idx(hourly, "wind_direction_10m", i),
                        wind_gust_ms=_safe_idx(hourly, "wind_gusts_10m", i),
                        precipitation_mm=_safe_idx(hourly, "precipitation", i),
                        weather_code=_safe_idx_int(hourly, "weather_code", i),
                        dew_point_c=_safe_idx(hourly, "dew_point_2m", i),
                        visibility_m=_safe_idx(hourly, "visibility", i),
                        uv_index=_safe_idx(hourly, "uv_index", i),
                        solar_radiation_wm2=_safe_idx(hourly, "direct_radiation", i),
                        ingested_at=now,
                    )
                )

        return observations


def _safe_idx(data: dict, key: str, idx: int) -> float | None:
    values = data.get(key)
    if values and idx < len(values):
        return values[idx]
    return None


def _safe_idx_int(data: dict, key: str, idx: int) -> int | None:
    val = _safe_idx(data, key, idx)
    if val is not None:
        return int(val)
    return None
