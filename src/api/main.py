from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.api.v1.router import router as v1_router
from src.cache.redis_cache import RedisCache
from src.config.settings import get_settings

settings = get_settings()

_cache: RedisCache | None = None


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    global _cache
    _cache = RedisCache()
    try:
        await _cache.connect()
    except Exception:
        _cache = None
    yield
    if _cache:
        await _cache.disconnect()


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="Weather Intelligence Platform — eigen AI-gestuurde weervoorspellingen",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(v1_router, prefix="/api/v1")


@app.get("/health")
async def health() -> dict:
    return {
        "status": "ok",
        "service": settings.app_name,
        "version": settings.app_version,
    }
