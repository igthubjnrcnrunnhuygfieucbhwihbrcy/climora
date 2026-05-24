import abc
import datetime

import httpx
import structlog
from sqlalchemy.ext.asyncio import AsyncSession
from tenacity import retry, stop_after_attempt, wait_exponential

from src.db.models import WeatherObservation

logger = structlog.get_logger()


class BaseCollector(abc.ABC):
    """Base class for all weather data collectors."""

    source_name: str = "unknown"

    def __init__(self, http_client: httpx.AsyncClient | None = None) -> None:
        self._client = http_client or httpx.AsyncClient(timeout=30.0)

    @abc.abstractmethod
    async def fetch(
        self, latitude: float, longitude: float
    ) -> list[WeatherObservation]:
        """Fetch weather data and return observation objects."""

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=30),
    )
    async def _get(self, url: str, params: dict | None = None) -> dict:
        logger.info("collector.fetch", source=self.source_name, url=url)
        response = await self._client.get(url, params=params)
        response.raise_for_status()
        return response.json()

    async def collect_and_store(
        self,
        session: AsyncSession,
        latitude: float,
        longitude: float,
    ) -> int:
        """Fetch data and persist to database. Returns count of records stored."""
        try:
            observations = await self.fetch(latitude, longitude)
            for obs in observations:
                session.add(obs)
            await session.commit()
            logger.info(
                "collector.stored",
                source=self.source_name,
                count=len(observations),
            )
            return len(observations)
        except Exception:
            await session.rollback()
            logger.exception("collector.error", source=self.source_name)
            raise

    @staticmethod
    def _utcnow() -> datetime.datetime:
        return datetime.datetime.now(datetime.UTC)

    async def close(self) -> None:
        await self._client.aclose()
