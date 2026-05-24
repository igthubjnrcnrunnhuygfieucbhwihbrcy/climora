import datetime
import json

import structlog

from src.collectors.base import BaseCollector
from src.config.settings import get_settings
from src.db.models import WeatherObservation

logger = structlog.get_logger()
settings = get_settings()


class KNMICollector(BaseCollector):
    """Collect weather data from KNMI Data Platform.

    Requires a KNMI API key (free registration at
    https://developer.dataplatform.knmi.nl/).
    """

    source_name = "knmi"

    async def fetch(
        self, latitude: float, longitude: float
    ) -> list[WeatherObservation]:
        if not settings.knmi_api_key:
            logger.warning("collector.knmi.no_api_key", msg="KNMI API key not configured")
            return []

        data = await self._get_knmi_actual()
        return self._parse_response(data, latitude, longitude)

    async def _get_knmi_actual(self) -> dict:
        """Fetch the latest 10-minute observation data from KNMI."""
        headers = {"Authorization": settings.knmi_api_key}
        response = await self._client.get(
            f"{settings.knmi_base_url}/datasets/Actuele10telegraaf/versions/2/files",
            headers=headers,
            params={"maxKeys": 1, "orderBy": "created", "sorting": "desc"},
        )
        response.raise_for_status()
        files_data = response.json()

        if not files_data.get("files"):
            return {}

        file_url = files_data["files"][0].get("url", "")
        if not file_url:
            filename = files_data["files"][0].get("filename", "")
            file_response = await self._client.get(
                f"{settings.knmi_base_url}/datasets/Actuele10telegraaf/versions/2/files/{filename}/url",
                headers=headers,
            )
            file_response.raise_for_status()
            file_url = file_response.json().get("temporaryDownloadUrl", "")

        if file_url:
            data_response = await self._client.get(file_url)
            data_response.raise_for_status()
            return self._parse_knmi_text(data_response.text)

        return {}

    def _parse_knmi_text(self, text: str) -> dict:
        """Parse KNMI text-format observation data."""
        lines = text.strip().split("\n")
        header_line = ""
        data_lines: list[str] = []

        in_data = False
        for line in lines:
            stripped = line.strip()
            if stripped.startswith("# STN"):
                header_line = stripped.lstrip("# ").strip()
                in_data = True
                continue
            if in_data and stripped and not stripped.startswith("#"):
                data_lines.append(stripped)

        if not header_line or not data_lines:
            return {}

        headers = [h.strip() for h in header_line.split(",")]
        result: dict = {"stations": []}
        for data_line in data_lines:
            values = [v.strip() for v in data_line.split(",")]
            station = dict(zip(headers, values, strict=False))
            result["stations"].append(station)

        return result

    def _parse_response(
        self, data: dict, latitude: float, longitude: float
    ) -> list[WeatherObservation]:
        observations: list[WeatherObservation] = []
        now = self._utcnow()

        for station in data.get("stations", []):
            date_str = station.get("YYYYMMDD", "")
            hour_str = station.get("HH", "0")
            if not date_str:
                continue

            try:
                ts = datetime.datetime.strptime(date_str, "%Y%m%d").replace(
                    hour=int(hour_str), tzinfo=datetime.UTC
                )
            except (ValueError, TypeError):
                continue

            observations.append(
                WeatherObservation(
                    timestamp=ts,
                    source=self.source_name,
                    latitude=latitude,
                    longitude=longitude,
                    location_name=settings.default_location_name,
                    temperature_c=_knmi_temp(station.get("T")),
                    humidity_pct=_knmi_float(station.get("U")),
                    pressure_hpa=_knmi_pressure(station.get("P")),
                    wind_speed_ms=_knmi_wind(station.get("FF")),
                    wind_direction_deg=_knmi_float(station.get("DD")),
                    wind_gust_ms=_knmi_wind(station.get("FX")),
                    precipitation_mm=_knmi_precip(station.get("RH")),
                    visibility_m=_knmi_vis(station.get("VV")),
                    cloud_cover_pct=_knmi_cloud(station.get("N")),
                    raw_data=json.dumps(station),
                    ingested_at=now,
                )
            )

        return observations

    async def fetch_historical_daily(
        self,
        station_id: str,
        start_date: str,
        end_date: str,
    ) -> list[WeatherObservation]:
        """Fetch historical daily data from KNMI (free, no key needed)."""
        response = await self._client.post(
            "https://www.daggegevens.knmi.nl/klimatologie/daggegevens",
            data={
                "stns": station_id,
                "start": start_date.replace("-", ""),
                "end": end_date.replace("-", ""),
                "vars": "TEMP:SQ:SP:Q:DR:RH:UN:UX:FG:FHX:FHN:DDVEC:FHXH",
            },
        )
        response.raise_for_status()
        return self._parse_historical(response.text)

    def _parse_historical(self, text: str) -> list[WeatherObservation]:
        return self._parse_response(self._parse_knmi_text(text), 0.0, 0.0)


def _knmi_temp(val: str | None) -> float | None:
    if val is None or val.strip() == "":
        return None
    try:
        return int(val) / 10.0
    except ValueError:
        return None


def _knmi_float(val: str | None) -> float | None:
    if val is None or val.strip() == "":
        return None
    try:
        return float(val)
    except ValueError:
        return None


def _knmi_pressure(val: str | None) -> float | None:
    if val is None or val.strip() == "":
        return None
    try:
        return int(val) / 10.0
    except ValueError:
        return None


def _knmi_wind(val: str | None) -> float | None:
    if val is None or val.strip() == "":
        return None
    try:
        return int(val) / 10.0
    except ValueError:
        return None


def _knmi_precip(val: str | None) -> float | None:
    if val is None or val.strip() == "":
        return None
    try:
        v = int(val)
        if v == -1:
            return 0.05
        return v / 10.0
    except ValueError:
        return None


def _knmi_vis(val: str | None) -> float | None:
    if val is None or val.strip() == "":
        return None
    try:
        return float(val) * 100.0
    except ValueError:
        return None


def _knmi_cloud(val: str | None) -> float | None:
    if val is None or val.strip() == "":
        return None
    try:
        return float(val) / 9.0 * 100.0
    except ValueError:
        return None
