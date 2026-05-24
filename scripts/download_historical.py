"""Download historical weather data from multiple sources.

Usage:
    python -m scripts.download_historical --source knmi --years 5
    python -m scripts.download_historical --source openmeteo --years 10
    python -m scripts.download_historical --source meteostat --years 5
"""

import argparse
import asyncio
import datetime

import structlog

from src.collectors.collector_knmi import KNMICollector
from src.collectors.collector_openmeteo import OpenMeteoCollector
from src.config.settings import get_settings

logger = structlog.get_logger()
settings = get_settings()

KNMI_STATION_ALMELO = "290"  # Closest KNMI station to Almelo (Twenthe)


async def download_openmeteo_historical(years: int) -> None:
    """Download historical weather from Open-Meteo archive API (free)."""
    collector = OpenMeteoCollector()
    end_date = datetime.date.today()
    start_date = end_date - datetime.timedelta(days=years * 365)

    chunk_days = 90
    current = start_date

    total_records = 0
    while current < end_date:
        chunk_end = min(current + datetime.timedelta(days=chunk_days), end_date)
        logger.info(
            "historical.openmeteo.chunk",
            start=current.isoformat(),
            end=chunk_end.isoformat(),
        )

        try:
            observations = await collector.fetch_historical(
                latitude=settings.default_latitude,
                longitude=settings.default_longitude,
                start_date=current.isoformat(),
                end_date=chunk_end.isoformat(),
            )
            total_records += len(observations)
            logger.info(
                "historical.openmeteo.fetched",
                records=len(observations),
                total=total_records,
            )
        except Exception:
            logger.exception("historical.openmeteo.error", start=current.isoformat())

        current = chunk_end + datetime.timedelta(days=1)
        await asyncio.sleep(1)

    await collector.close()
    logger.info("historical.openmeteo.complete", total_records=total_records)


async def download_knmi_historical(years: int) -> None:
    """Download historical weather from KNMI daily data (free, no API key needed)."""
    collector = KNMICollector()
    end_date = datetime.date.today()
    start_date = end_date - datetime.timedelta(days=years * 365)

    logger.info(
        "historical.knmi.start",
        station=KNMI_STATION_ALMELO,
        start=start_date.isoformat(),
        end=end_date.isoformat(),
    )

    try:
        observations = await collector.fetch_historical_daily(
            station_id=KNMI_STATION_ALMELO,
            start_date=start_date.isoformat(),
            end_date=end_date.isoformat(),
        )
        logger.info("historical.knmi.complete", records=len(observations))
    except Exception:
        logger.exception("historical.knmi.error")

    await collector.close()


async def download_meteostat_historical(years: int) -> None:
    """Download historical data via Meteostat (requires API key)."""
    if not settings.meteostat_api_key:
        logger.warning("historical.meteostat.no_key", msg="Set CLIMORA_METEOSTAT_API_KEY")
        return

    import httpx

    end_date = datetime.date.today()
    start_date = end_date - datetime.timedelta(days=years * 365)

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.get(
            "https://meteostat.p.rapidapi.com/stations/daily",
            params={
                "station": "10406",  # Enschede/Twenthe
                "start": start_date.isoformat(),
                "end": end_date.isoformat(),
            },
            headers={
                "X-RapidAPI-Key": settings.meteostat_api_key,
                "X-RapidAPI-Host": "meteostat.p.rapidapi.com",
            },
        )
        response.raise_for_status()
        data = response.json()
        records = data.get("data", [])
        logger.info("historical.meteostat.complete", records=len(records))


async def main() -> None:
    parser = argparse.ArgumentParser(description="Download historical weather data")
    parser.add_argument(
        "--source",
        choices=["openmeteo", "knmi", "meteostat", "all"],
        default="all",
        help="Data source to download from",
    )
    parser.add_argument(
        "--years",
        type=int,
        default=5,
        help="Number of years of historical data",
    )
    args = parser.parse_args()

    if args.source in ("openmeteo", "all"):
        await download_openmeteo_historical(args.years)

    if args.source in ("knmi", "all"):
        await download_knmi_historical(args.years)

    if args.source in ("meteostat", "all"):
        await download_meteostat_historical(args.years)


if __name__ == "__main__":
    asyncio.run(main())
