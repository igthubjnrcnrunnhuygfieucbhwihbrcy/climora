

from src.collectors.collector_openmeteo import OpenMeteoCollector


class TestOpenMeteoCollector:
    def setup_method(self) -> None:
        self.collector = OpenMeteoCollector()

    def test_parse_current_response(self) -> None:
        data = {
            "current": {
                "time": "2024-03-15T12:00",
                "temperature_2m": 15.2,
                "relative_humidity_2m": 72,
                "apparent_temperature": 13.5,
                "pressure_msl": 1013.2,
                "cloud_cover": 45,
                "wind_speed_10m": 4.5,
                "wind_direction_10m": 220,
                "wind_gusts_10m": 8.1,
                "precipitation": 0.0,
                "weather_code": 2,
                "dew_point_2m": 10.1,
                "visibility": 24000,
                "uv_index": 3.2,
                "direct_radiation": 450.0,
            }
        }

        observations = self.collector._parse_response(data, 52.35, 6.66)

        assert len(observations) == 1
        obs = observations[0]
        assert obs.temperature_c == 15.2
        assert obs.humidity_pct == 72
        assert obs.pressure_hpa == 1013.2
        assert obs.wind_speed_ms == 4.5
        assert obs.source == "openmeteo"

    def test_parse_hourly_response(self) -> None:
        data = {
            "hourly": {
                "time": ["2024-03-15T00:00", "2024-03-15T01:00"],
                "temperature_2m": [8.5, 8.1],
                "relative_humidity_2m": [85, 87],
                "apparent_temperature": [6.0, 5.5],
                "pressure_msl": [1015.0, 1014.8],
                "cloud_cover": [90, 95],
                "wind_speed_10m": [3.2, 2.8],
                "wind_direction_10m": [180, 190],
                "wind_gusts_10m": [6.5, 5.9],
                "precipitation": [0.0, 0.2],
                "weather_code": [3, 61],
                "dew_point_2m": [6.0, 6.2],
                "visibility": [20000, 15000],
                "uv_index": [0, 0],
                "direct_radiation": [0, 0],
            }
        }

        observations = self.collector._parse_response(data, 52.35, 6.66)

        assert len(observations) == 2
        assert observations[0].temperature_c == 8.5
        assert observations[1].temperature_c == 8.1
        assert observations[1].precipitation_mm == 0.2

    def test_parse_empty_response(self) -> None:
        observations = self.collector._parse_response({}, 52.35, 6.66)
        assert len(observations) == 0
