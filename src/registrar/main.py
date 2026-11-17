from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .database import init_db
from .routers import auth, dns, domains
from .tlds import ALL_TLDS

STATIC_DIR = Path(__file__).parent / "static"


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    yield


app = FastAPI(
    title="Climora Registrar",
    description="Gratis domeinregistratie met ondersteuning voor honderden TLD's",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/v1")
app.include_router(domains.router, prefix="/api/v1")
app.include_router(dns.router, prefix="/api/v1")


@app.get("/api/v1/tlds")
def list_tlds():
    return [
        {
            "tld": info.tld,
            "category": info.category,
            "restriction": info.restriction,
            "price": info.price,
        }
        for info in ALL_TLDS
    ]


@app.get("/api/v1/health")
def health():
    return {"status": "ok", "tlds": len(ALL_TLDS)}


@app.get("/", include_in_schema=False)
def index():
    return FileResponse(STATIC_DIR / "index.html")


app.mount("/", StaticFiles(directory=STATIC_DIR), name="static")
