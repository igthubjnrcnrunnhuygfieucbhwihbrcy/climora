from src.collectors.collector_knmi import (
    KNMICollector,
    _knmi_cloud,
    _knmi_precip,
    _knmi_pressure,
    _knmi_temp,
    _knmi_wind,
)


class TestKNMIParser:
    def test_knmi_temp(self) -> None:
        assert _knmi_temp("152") == 15.2
        assert _knmi_temp("-30") == -3.0
        assert _knmi_temp(None) is None
        assert _knmi_temp("") is None

    def test_knmi_pressure(self) -> None:
        assert _knmi_pressure("10132") == 1013.2
        assert _knmi_pressure(None) is None

    def test_knmi_wind(self) -> None:
        assert _knmi_wind("45") == 4.5
        assert _knmi_wind(None) is None

    def test_knmi_precip(self) -> None:
        assert _knmi_precip("25") == 2.5
        assert _knmi_precip("-1") == 0.05
        assert _knmi_precip(None) is None

    def test_knmi_cloud(self) -> None:
        result = _knmi_cloud("9")
        assert result is not None
        assert abs(result - 100.0) < 0.01
        assert _knmi_cloud("0") == 0.0


class TestKNMICollector:
    def setup_method(self) -> None:
        self.collector = KNMICollector()

    def test_parse_knmi_text(self) -> None:
        text = """# BRON: KONINKLIJK NEDERLANDS METEOROLOGISCH INSTITUUT (KNMI)
# STN,YYYYMMDD,   HH,   DD,   FF,    T,    U,    P
  290,20240315,   12,  220,   45,  152,   72,10132
  290,20240315,   13,  225,   50,  148,   74,10128
"""
        result = self.collector._parse_knmi_text(text)
        assert "stations" in result
        assert len(result["stations"]) == 2
        assert result["stations"][0]["T"] == "152"

    def test_parse_empty_text(self) -> None:
        result = self.collector._parse_knmi_text("")
        assert result == {}
