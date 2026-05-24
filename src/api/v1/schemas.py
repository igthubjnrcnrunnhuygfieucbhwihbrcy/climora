import datetime

from pydantic import BaseModel, Field


class LocationQuery(BaseModel):
    latitude: float = Field(default=52.3567, description="Latitude (default: Almelo)")
    longitude: float = Field(default=6.6683, description="Longitude (default: Almelo)")


class CurrentWeatherResponse(BaseModel):
    timestamp: datetime.datetime
    location: str
    latitude: float
    longitude: float
    temperature_c: float | None = None
    feels_like_c: float | None = None
    humidity_pct: float | None = None
    pressure_hpa: float | None = None
    wind_speed_ms: float | None = None
    wind_direction_deg: float | None = None
    wind_gust_ms: float | None = None
    precipitation_mm: float | None = None
    cloud_cover_pct: float | None = None
    visibility_m: float | None = None
    uv_index: float | None = None
    weather_code: int | None = None
    weather_description: str | None = None
    confidence: float | None = Field(None, ge=0, le=100)
    source: str = "climora"
    bias_corrected: bool = False


class HourlyForecastItem(BaseModel):
    timestamp: datetime.datetime
    temperature_c: float | None = None
    feels_like_c: float | None = None
    humidity_pct: float | None = None
    pressure_hpa: float | None = None
    wind_speed_ms: float | None = None
    wind_direction_deg: float | None = None
    precipitation_mm: float | None = None
    precipitation_probability_pct: float | None = None
    cloud_cover_pct: float | None = None
    weather_code: int | None = None
    weather_description: str | None = None
    confidence: float | None = Field(None, ge=0, le=100)


class HourlyForecastResponse(BaseModel):
    location: str
    latitude: float
    longitude: float
    generated_at: datetime.datetime
    source: str = "climora"
    bias_corrected: bool = False
    hourly: list[HourlyForecastItem]


class DailyForecastItem(BaseModel):
    date: datetime.date
    temperature_max_c: float | None = None
    temperature_min_c: float | None = None
    temperature_mean_c: float | None = None
    humidity_mean_pct: float | None = None
    pressure_mean_hpa: float | None = None
    wind_speed_max_ms: float | None = None
    wind_direction_dominant_deg: float | None = None
    precipitation_sum_mm: float | None = None
    precipitation_probability_pct: float | None = None
    weather_code: int | None = None
    weather_description: str | None = None
    sunrise: datetime.datetime | None = None
    sunset: datetime.datetime | None = None
    confidence: float | None = Field(None, ge=0, le=100)


class DailyForecastResponse(BaseModel):
    location: str
    latitude: float
    longitude: float
    generated_at: datetime.datetime
    source: str = "climora"
    bias_corrected: bool = False
    daily: list[DailyForecastItem]


class AirQualityResponse(BaseModel):
    timestamp: datetime.datetime
    location: str
    latitude: float
    longitude: float
    pm25: float | None = None
    pm10: float | None = None
    ozone: float | None = None
    no2: float | None = None
    so2: float | None = None
    co: float | None = None
    aqi: int | None = None
    aqi_category: str | None = None
    source: str = "climora"


class RadarResponse(BaseModel):
    timestamp: datetime.datetime
    location: str
    latitude: float
    longitude: float
    radar_url: str | None = None
    precipitation_intensity: str | None = None
    message: str = "Radar integration coming soon"


class HealthResponse(BaseModel):
    status: str
    service: str
    version: str
    database: str = "unknown"
    cache: str = "unknown"
    collectors: dict[str, str] = {}


WMO_WEATHER_CODES: dict[int, str] = {
    0: "Helder",
    1: "Overwegend helder",
    2: "Half bewolkt",
    3: "Bewolkt",
    45: "Mist",
    48: "Rijpmist",
    51: "Lichte motregen",
    53: "Motregen",
    55: "Dichte motregen",
    56: "Lichte ijzel",
    57: "Ijzel",
    61: "Lichte regen",
    63: "Regen",
    65: "Hevige regen",
    66: "Lichte ijsregen",
    67: "IJsregen",
    71: "Lichte sneeuw",
    73: "Sneeuw",
    75: "Hevige sneeuw",
    77: "Sneeuwkorrels",
    80: "Lichte regenbuien",
    81: "Regenbuien",
    82: "Hevige regenbuien",
    85: "Lichte sneeuwbuien",
    86: "Hevige sneeuwbuien",
    95: "Onweer",
    96: "Onweer met lichte hagel",
    99: "Onweer met zware hagel",
}
