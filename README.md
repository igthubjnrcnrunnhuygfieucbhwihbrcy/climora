# Climora Atmos Core

**Weather Intelligence Platform** — eigen AI-gestuurde weervoorspellingen met lokale bias-correctie.

## Architectuur

```
extern weer (Open-Meteo, KNMI, Meteostat)
       ↓
  Data Collectors (microservices)
       ↓
  PostgreSQL + TimescaleDB
       ↓
  AI Model Pipeline
  ├── Bias Correction (XGBoost/LightGBM)
  ├── Time-Series Forecast (N-BEATS / TFT / LSTM)
  └── Confidence Model
       ↓
  FastAPI — /api/v1/*
       ↓
  Redis Cache
       ↓
  Website / App
```

## Componenten

| Laag | Technologie | Doel |
|------|-------------|------|
| Data Ingestie | Python collectors | Open-Meteo, KNMI, lokaal station |
| Opslag | PostgreSQL + TimescaleDB | Historische + live data |
| Cache | Redis | Snelle API responses |
| AI Models | XGBoost, LightGBM, PyTorch | Bias correctie, forecasting, confidence |
| API | FastAPI | Versioned REST endpoints |
| Infra | Docker Compose | Alles containerized |

## Quick Start

```bash
# Clone en start
git clone https://github.com/your-org/climora.git
cd climora

# Start alle services
docker compose up -d

# Of lokaal ontwikkelen
pip install -e ".[dev]"
uvicorn src.api.main:app --reload
```

## API Endpoints

```
GET /api/v1/current        — Huidig weer
GET /api/v1/hourly         — Uurlijkse voorspelling
GET /api/v1/daily          — Dagelijkse voorspelling
GET /api/v1/forecast/40day — 40-dagen voorspelling
GET /api/v1/radar          — Radardata
GET /api/v1/airquality     — Luchtkwaliteit
GET /api/v1/health         — Health check
```

## Ontwikkeling

```bash
# Tests
pytest

# Lint
ruff check src/ tests/

# Type check
mypy src/
```

## Licentie

MIT
