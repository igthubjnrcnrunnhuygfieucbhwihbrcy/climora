import datetime
import json

import structlog

from src.collectors.base import BaseCollector
from src.config.settings import get_settings
from src.db.models import WeatherObservation

logger = structlog.get_logger()
settings = get_settings()


class LocalStationCollector(BaseCollector):
    """Collect data from a local weather station (TFA Dostmann / mijneigenweer.nl).

    Expects the local station to expose a JSON endpoint with current readings.
    The URL and data format can be configured via settings.
    """

    source_name = "local_station"

    async def fetch(
        self, latitude: float, longitude: float
    ) -> list[WeatherObservation]:
        if not settings.local_station_enabled or not settings.local_station_url:
            logger.info(
                "collector.local.disabled",
                msg="Local station not configured",
            )
            return []

        data = await self._get(settings.local_station_url)
        return self._parse_response(data, latitude, longitude)

    def _parse_response(
        self, data: dict, latitude: float, longitude: float
    ) -> list[WeatherObservation]:
        now = self._utcnow()

        observation = WeatherObservation(
            timestamp=_parse_timestamp(data) or now,
            source=self.source_name,
            latitude=latitude,
            longitude=longitude,
            location_name=settings.default_location_name,
            temperature_c=_extract_float(data, ["temperature", "temp", "Temperature"]),
            humidity_pct=_extract_float(data, ["humidity", "Humidity", "rh"]),
            pressure_hpa=_extract_float(data, ["pressure", "Pressure", "barometer"]),
            wind_speed_ms=_extract_float(data, ["wind_speed", "windSpeed", "WindSpeed"]),
            wind_direction_deg=_extract_float(
                data, ["wind_direction", "windDir", "WindDirection"]
            ),
            wind_gust_ms=_extract_float(data, ["wind_gust", "windGust", "WindGust"]),
            precipitation_mm=_extract_float(data, ["rain", "precipitation", "Rain"]),
            uv_index=_extract_float(data, ["uv", "uv_index", "UV"]),
            solar_radiation_wm2=_extract_float(
                data, ["solar_radiation", "solarRadiation", "Solar"]
            ),
            dew_point_c=_extract_float(data, ["dew_point", "dewPoint", "DewPoint"]),
            raw_data=json.dumps(data),
            ingested_at=now,
        )

        return [observation]


def _extract_float(data: dict, keys: list[str]) -> float | None:
    for key in keys:
        if key in data:
            try:
                return float(data[key])
            except (ValueError, TypeError):
                continue
    return None


def _parse_timestamp(data: dict) -> datetime.datetime | None:
    for key in ["timestamp", "time", "datetime", "date"]:
        if key in data:
            try:
                return datetime.datetime.fromisoformat(str(data[key])).replace(
                    tzinfo=datetime.UTC
                )
            except (ValueError, TypeError):
                continue
    return None
