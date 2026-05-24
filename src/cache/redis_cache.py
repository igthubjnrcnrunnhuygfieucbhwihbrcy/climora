import json
from typing import Any

import redis.asyncio as redis
import structlog

from src.config.settings import get_settings

logger = structlog.get_logger()
settings = get_settings()


class RedisCache:
    """Async Redis cache for API responses."""

    def __init__(self, url: str | None = None) -> None:
        self._url = url or settings.redis_url
        self._redis: redis.Redis | None = None

    async def connect(self) -> None:
        self._redis = redis.from_url(self._url, decode_responses=True)
        logger.info("cache.connected", url=self._url)

    async def disconnect(self) -> None:
        if self._redis:
            await self._redis.aclose()
            logger.info("cache.disconnected")

    async def get(self, key: str) -> Any | None:
        if not self._redis:
            return None
        try:
            value = await self._redis.get(key)
            if value:
                return json.loads(value)
        except (redis.RedisError, json.JSONDecodeError):
            logger.warning("cache.get_error", key=key)
        return None

    async def set(self, key: str, value: Any, ttl: int | None = None) -> None:
        if not self._redis:
            return
        try:
            serialized = json.dumps(value, default=str)
            if ttl:
                await self._redis.setex(key, ttl, serialized)
            else:
                await self._redis.set(key, serialized)
        except (redis.RedisError, TypeError):
            logger.warning("cache.set_error", key=key)

    async def delete(self, key: str) -> None:
        if not self._redis:
            return
        try:
            await self._redis.delete(key)
        except redis.RedisError:
            logger.warning("cache.delete_error", key=key)

    async def flush_pattern(self, pattern: str) -> int:
        if not self._redis:
            return 0
        try:
            keys = []
            async for key in self._redis.scan_iter(match=pattern):
                keys.append(key)
            if keys:
                await self._redis.delete(*keys)
            return len(keys)
        except redis.RedisError:
            logger.warning("cache.flush_error", pattern=pattern)
            return 0


_cache_instance: RedisCache | None = None


async def get_cache() -> RedisCache:
    global _cache_instance
    if _cache_instance is None:
        _cache_instance = RedisCache()
        await _cache_instance.connect()
    return _cache_instance
