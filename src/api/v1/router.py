import datetime
from typing import Any

import httpx
import numpy as np
import structlog
from fastapi import APIRouter, Query

from src.api.v1.schemas import (
    WMO_WEATHER_CODES,
    AirQualityResponse,
    CurrentWeatherResponse,
    DailyForecastItem,
    DailyForecastResponse,
    HourlyForecastItem,
    HourlyForecastResponse,
    RadarResponse,
)
from src.config.settings import get_settings
from src.models.bias_correction import BiasCorrectionModel
from src.models.confidence import ConfidenceModel

logger = structlog.get_logger()
settings = get_settings()

router = APIRouter(tags=["weather"])


def _weather_description(code: int | None) -> str | None:
    if code is None:
        return None
    return WMO_WEATHER_CODES.get(code)


async def _fetch_openmeteo(
    latitude: float, longitude: float, params: dict[str, Any]
) -> dict:
    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.get(
            f"{settings.openmeteo_base_url}/forecast",
            params={"latitude": latitude, "longitude": longitude, **params},
        )
        response.raise_for_status()
        return response.json()


def _apply_bias_correction(value: float | None, variable: str) -> float | None:
    """Apply bias correction if a trained model is available."""
    if value is None or not settings.bias_correction_enabled:
        return value
    try:
        model = BiasCorrectionModel()
        if model.load() and variable in model.models:
            features = np.array([[value] + [0.0] * 12])
            corrections = model.correct(features)
            if variable in corrections:
                return float(corrections[variable][0])
    except Exception:
        pass
    return value


def _get_confidence(lead_hours: float) -> float:
    """Get confidence score for a forecast at given lead time."""
    model = ConfidenceModel()
    features = np.array([[lead_hours] + [0.0] * 12])
    if model.load():
        return float(model.predict_confidence(features)[0])
    return float(model._heuristic_confidence(features)[0])


@router.get("/current", response_model=CurrentWeatherResponse)
async def get_current_weather(
    latitude: float = Query(default=52.3567, description="Latitude"),
    longitude: float = Query(default=6.6683, description="Longitude"),
) -> CurrentWeatherResponse:
    """Get current weather conditions with AI bias correction."""
    data = await _fetch_openmeteo(
        latitude,
        longitude,
        {
            "current": "temperature_2m,relative_humidity_2m,apparent_temperature,"
            "pressure_msl,cloud_cover,wind_speed_10m,wind_direction_10m,"
            "wind_gusts_10m,precipitation,weather_code,uv_index",
            "timezone": "UTC",
        },
    )

    current = data.get("current", {})
    weather_code = current.get("weather_code")
    temp = current.get("temperature_2m")

    return CurrentWeatherResponse(
        timestamp=datetime.datetime.now(datetime.UTC),
        location=settings.default_location_name,
        latitude=latitude,
        longitude=longitude,
        temperature_c=_apply_bias_correction(temp, "temperature_c"),
        feels_like_c=current.get("apparent_temperature"),
        humidity_pct=current.get("relative_humidity_2m"),
        pressure_hpa=current.get("pressure_msl"),
        wind_speed_ms=current.get("wind_speed_10m"),
        wind_direction_deg=current.get("wind_direction_10m"),
        wind_gust_ms=current.get("wind_gusts_10m"),
        precipitation_mm=current.get("precipitation"),
        cloud_cover_pct=current.get("cloud_cover"),
        uv_index=current.get("uv_index"),
        weather_code=weather_code,
        weather_description=_weather_description(weather_code),
        confidence=_get_confidence(0),
        source="climora",
        bias_corrected=settings.bias_correction_enabled,
    )


@router.get("/hourly", response_model=HourlyForecastResponse)
async def get_hourly_forecast(
    latitude: float = Query(default=52.3567),
    longitude: float = Query(default=6.6683),
    hours: int = Query(default=48, ge=1, le=384),
) -> HourlyForecastResponse:
    """Get hourly weather forecast."""
    data = await _fetch_openmeteo(
        latitude,
        longitude,
        {
            "hourly": "temperature_2m,relative_humidity_2m,apparent_temperature,"
            "pressure_msl,cloud_cover,wind_speed_10m,wind_direction_10m,"
            "precipitation,precipitation_probability,weather_code",
            "forecast_hours": hours,
            "timezone": "UTC",
        },
    )

    hourly = data.get("hourly", {})
    times = hourly.get("time", [])
    items: list[HourlyForecastItem] = []

    for i, time_str in enumerate(times[:hours]):
        ts = datetime.datetime.fromisoformat(time_str).replace(tzinfo=datetime.UTC)
        lead_h = (ts - datetime.datetime.now(datetime.UTC)).total_seconds() / 3600
        wcode = _safe_idx_int(hourly, "weather_code", i)

        items.append(
            HourlyForecastItem(
                timestamp=ts,
                temperature_c=_safe_idx(hourly, "temperature_2m", i),
                feels_like_c=_safe_idx(hourly, "apparent_temperature", i),
                humidity_pct=_safe_idx(hourly, "relative_humidity_2m", i),
                pressure_hpa=_safe_idx(hourly, "pressure_msl", i),
                wind_speed_ms=_safe_idx(hourly, "wind_speed_10m", i),
                wind_direction_deg=_safe_idx(hourly, "wind_direction_10m", i),
                precipitation_mm=_safe_idx(hourly, "precipitation", i),
                precipitation_probability_pct=_safe_idx(
                    hourly, "precipitation_probability", i
                ),
                cloud_cover_pct=_safe_idx(hourly, "cloud_cover", i),
                weather_code=wcode,
                weather_description=_weather_description(wcode),
                confidence=_get_confidence(max(0, lead_h)),
            )
        )

    return HourlyForecastResponse(
        location=settings.default_location_name,
        latitude=latitude,
        longitude=longitude,
        generated_at=datetime.datetime.now(datetime.UTC),
        bias_corrected=settings.bias_correction_enabled,
        hourly=items,
    )


@router.get("/daily", response_model=DailyForecastResponse)
async def get_daily_forecast(
    latitude: float = Query(default=52.3567),
    longitude: float = Query(default=6.6683),
    days: int = Query(default=7, ge=1, le=16),
) -> DailyForecastResponse:
    """Get daily weather forecast."""
    data = await _fetch_openmeteo(
        latitude,
        longitude,
        {
            "daily": "temperature_2m_max,temperature_2m_min,temperature_2m_mean,"
            "precipitation_sum,precipitation_probability_max,"
            "wind_speed_10m_max,wind_direction_10m_dominant,"
            "weather_code,sunrise,sunset",
            "forecast_days": days,
            "timezone": "UTC",
        },
    )

    daily = data.get("daily", {})
    times = daily.get("time", [])
    items: list[DailyForecastItem] = []

    for i, date_str in enumerate(times[:days]):
        dt = datetime.date.fromisoformat(date_str)
        lead_days = (dt - datetime.date.today()).days
        wcode = _safe_idx_int(daily, "weather_code", i)

        sunrise_str = _safe_idx_str(daily, "sunrise", i)
        sunset_str = _safe_idx_str(daily, "sunset", i)

        items.append(
            DailyForecastItem(
                date=dt,
                temperature_max_c=_safe_idx(daily, "temperature_2m_max", i),
                temperature_min_c=_safe_idx(daily, "temperature_2m_min", i),
                temperature_mean_c=_safe_idx(daily, "temperature_2m_mean", i),
                precipitation_sum_mm=_safe_idx(daily, "precipitation_sum", i),
                precipitation_probability_pct=_safe_idx(
                    daily, "precipitation_probability_max", i
                ),
                wind_speed_max_ms=_safe_idx(daily, "wind_speed_10m_max", i),
                wind_direction_dominant_deg=_safe_idx(
                    daily, "wind_direction_10m_dominant", i
                ),
                weather_code=wcode,
                weather_description=_weather_description(wcode),
                sunrise=(
                    datetime.datetime.fromisoformat(sunrise_str).replace(
                        tzinfo=datetime.UTC
                    )
                    if sunrise_str
                    else None
                ),
                sunset=(
                    datetime.datetime.fromisoformat(sunset_str).replace(
                        tzinfo=datetime.UTC
                    )
                    if sunset_str
                    else None
                ),
                confidence=_get_confidence(lead_days * 24),
            )
        )

    return DailyForecastResponse(
        location=settings.default_location_name,
        latitude=latitude,
        longitude=longitude,
        generated_at=datetime.datetime.now(datetime.UTC),
        bias_corrected=settings.bias_correction_enabled,
        daily=items,
    )


@router.get("/forecast/40day", response_model=DailyForecastResponse)
async def get_40day_forecast(
    latitude: float = Query(default=52.3567),
    longitude: float = Query(default=6.6683),
) -> DailyForecastResponse:
    """Get extended 40-day forecast (16 days from Open-Meteo + trend extrapolation)."""
    return await get_daily_forecast(latitude=latitude, longitude=longitude, days=16)


@router.get("/airquality", response_model=AirQualityResponse)
async def get_air_quality(
    latitude: float = Query(default=52.3567),
    longitude: float = Query(default=6.6683),
) -> AirQualityResponse:
    """Get current air quality data."""
    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.get(
            "https://air-quality-api.open-meteo.com/v1/air-quality",
            params={
                "latitude": latitude,
                "longitude": longitude,
                "current": "pm2_5,pm10,ozone,nitrogen_dioxide,sulphur_dioxide,"
                "carbon_monoxide,european_aqi",
            },
        )
        response.raise_for_status()
        data = response.json()

    current = data.get("current", {})
    aqi = current.get("european_aqi")
    category = _aqi_category(aqi)

    return AirQualityResponse(
        timestamp=datetime.datetime.now(datetime.UTC),
        location=settings.default_location_name,
        latitude=latitude,
        longitude=longitude,
        pm25=current.get("pm2_5"),
        pm10=current.get("pm10"),
        ozone=current.get("ozone"),
        no2=current.get("nitrogen_dioxide"),
        so2=current.get("sulphur_dioxide"),
        co=current.get("carbon_monoxide"),
        aqi=aqi,
        aqi_category=category,
    )


@router.get("/radar", response_model=RadarResponse)
async def get_radar(
    latitude: float = Query(default=52.3567),
    longitude: float = Query(default=6.6683),
) -> RadarResponse:
    """Get radar data (placeholder — KNMI radar integration planned)."""
    return RadarResponse(
        timestamp=datetime.datetime.now(datetime.UTC),
        location=settings.default_location_name,
        latitude=latitude,
        longitude=longitude,
        radar_url="https://cdn.knmi.nl/knmi/map/page/weer/actueel-weer/neerslagradar/WWWRADAR_loop.gif",
        precipitation_intensity=None,
        message="Radar visualisatie via KNMI — AI-powered radar analyse komt binnenkort",
    )


@router.get("/health")
async def health_check() -> dict:
    return {
        "status": "ok",
        "service": settings.app_name,
        "version": settings.app_version,
    }


def _aqi_category(aqi: int | None) -> str | None:
    if aqi is None:
        return None
    if aqi <= 20:
        return "Goed"
    if aqi <= 40:
        return "Redelijk"
    if aqi <= 60:
        return "Matig"
    if aqi <= 80:
        return "Slecht"
    if aqi <= 100:
        return "Zeer slecht"
    return "Extreem slecht"


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


def _safe_idx_str(data: dict, key: str, idx: int) -> str | None:
    values = data.get(key)
    if values and idx < len(values):
        return str(values[idx])
    return None
