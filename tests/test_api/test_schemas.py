import datetime

from src.api.v1.schemas import (
    WMO_WEATHER_CODES,
    CurrentWeatherResponse,
    HourlyForecastItem,
)


class TestSchemas:
    def test_current_weather_response(self) -> None:
        response = CurrentWeatherResponse(
            timestamp=datetime.datetime.now(datetime.UTC),
            location="Almelo",
            latitude=52.35,
            longitude=6.66,
            temperature_c=15.2,
            humidity_pct=72.0,
            confidence=85.0,
        )
        assert response.temperature_c == 15.2
        assert response.source == "climora"
        assert response.bias_corrected is False

    def test_hourly_forecast_item(self) -> None:
        item = HourlyForecastItem(
            timestamp=datetime.datetime.now(datetime.UTC),
            temperature_c=12.0,
            precipitation_mm=0.5,
            confidence=75.0,
        )
        assert item.temperature_c == 12.0
        assert item.confidence == 75.0

    def test_wmo_codes_completeness(self) -> None:
        assert 0 in WMO_WEATHER_CODES
        assert 95 in WMO_WEATHER_CODES
        assert WMO_WEATHER_CODES[0] == "Helder"
        assert WMO_WEATHER_CODES[95] == "Onweer"
