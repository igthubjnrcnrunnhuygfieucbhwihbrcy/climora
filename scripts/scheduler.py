"""Periodic data collection scheduler.

Runs collectors at configured intervals to continuously ingest weather data.

Usage:
    python -m scripts.scheduler
"""

import asyncio

import structlog
from apscheduler.schedulers.asyncio import AsyncIOScheduler

from src.collectors.collector_knmi import KNMICollector
from src.collectors.collector_localstation import LocalStationCollector
from src.collectors.collector_openmeteo import OpenMeteoCollector
from src.config.settings import get_settings
from src.db.engine import async_session_factory

logger = structlog.get_logger()
settings = get_settings()


async def collect_openmeteo() -> None:
    collector = OpenMeteoCollector()
    async with async_session_factory() as session:
        try:
            count = await collector.collect_and_store(
                session, settings.default_latitude, settings.default_longitude
            )
            logger.info("scheduler.openmeteo.done", records=count)
        except Exception:
            logger.exception("scheduler.openmeteo.error")
    await collector.close()


async def collect_knmi() -> None:
    collector = KNMICollector()
    async with async_session_factory() as session:
        try:
            count = await collector.collect_and_store(
                session, settings.default_latitude, settings.default_longitude
            )
            logger.info("scheduler.knmi.done", records=count)
        except Exception:
            logger.exception("scheduler.knmi.error")
    await collector.close()


async def collect_local() -> None:
    collector = LocalStationCollector()
    async with async_session_factory() as session:
        try:
            count = await collector.collect_and_store(
                session, settings.default_latitude, settings.default_longitude
            )
            logger.info("scheduler.local.done", records=count)
        except Exception:
            logger.exception("scheduler.local.error")
    await collector.close()


def main() -> None:
    scheduler = AsyncIOScheduler()

    scheduler.add_job(
        collect_openmeteo,
        "interval",
        minutes=settings.collector_interval_openmeteo,
        id="openmeteo_collector",
    )
    scheduler.add_job(
        collect_knmi,
        "interval",
        minutes=settings.collector_interval_knmi,
        id="knmi_collector",
    )
    scheduler.add_job(
        collect_local,
        "interval",
        minutes=settings.collector_interval_local,
        id="local_collector",
    )

    logger.info(
        "scheduler.start",
        openmeteo_interval=settings.collector_interval_openmeteo,
        knmi_interval=settings.collector_interval_knmi,
        local_interval=settings.collector_interval_local,
    )

    scheduler.start()

    try:
        asyncio.get_event_loop().run_forever()
    except (KeyboardInterrupt, SystemExit):
        logger.info("scheduler.shutdown")
        scheduler.shutdown()


if __name__ == "__main__":
    main()
