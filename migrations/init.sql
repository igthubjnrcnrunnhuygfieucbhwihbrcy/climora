-- Climora database initialization
-- Creates TimescaleDB hypertables for time-series weather data

CREATE EXTENSION IF NOT EXISTS timescaledb;

-- Weather observations table
CREATE TABLE IF NOT EXISTS weather_observations (
    id SERIAL,
    timestamp TIMESTAMPTZ NOT NULL,
    source VARCHAR(50) NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    location_name VARCHAR(100),
    temperature_c DOUBLE PRECISION,
    feels_like_c DOUBLE PRECISION,
    humidity_pct DOUBLE PRECISION,
    pressure_hpa DOUBLE PRECISION,
    wind_speed_ms DOUBLE PRECISION,
    wind_direction_deg DOUBLE PRECISION,
    wind_gust_ms DOUBLE PRECISION,
    precipitation_mm DOUBLE PRECISION,
    cloud_cover_pct DOUBLE PRECISION,
    visibility_m DOUBLE PRECISION,
    uv_index DOUBLE PRECISION,
    dew_point_c DOUBLE PRECISION,
    solar_radiation_wm2 DOUBLE PRECISION,
    weather_code INTEGER,
    raw_data TEXT,
    ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id, timestamp)
);

SELECT create_hypertable('weather_observations', 'timestamp', if_not_exists => TRUE);

CREATE INDEX IF NOT EXISTS ix_obs_source_ts ON weather_observations (source, timestamp DESC);
CREATE INDEX IF NOT EXISTS ix_obs_location_ts ON weather_observations (latitude, longitude, timestamp DESC);

-- Weather forecasts table
CREATE TABLE IF NOT EXISTS weather_forecasts (
    id SERIAL,
    issued_at TIMESTAMPTZ NOT NULL,
    valid_at TIMESTAMPTZ NOT NULL,
    source VARCHAR(50) NOT NULL,
    model_name VARCHAR(100) NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    temperature_c DOUBLE PRECISION,
    feels_like_c DOUBLE PRECISION,
    humidity_pct DOUBLE PRECISION,
    pressure_hpa DOUBLE PRECISION,
    wind_speed_ms DOUBLE PRECISION,
    wind_direction_deg DOUBLE PRECISION,
    precipitation_mm DOUBLE PRECISION,
    precipitation_probability_pct DOUBLE PRECISION,
    cloud_cover_pct DOUBLE PRECISION,
    weather_code INTEGER,
    confidence DOUBLE PRECISION,
    bias_corrected BOOLEAN DEFAULT FALSE,
    raw_data TEXT,
    ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id, valid_at)
);

SELECT create_hypertable('weather_forecasts', 'valid_at', if_not_exists => TRUE);

CREATE INDEX IF NOT EXISTS ix_fc_source_valid ON weather_forecasts (source, valid_at DESC);
CREATE INDEX IF NOT EXISTS ix_fc_model_valid ON weather_forecasts (model_name, valid_at DESC);

-- Model performance metrics
CREATE TABLE IF NOT EXISTS model_metrics (
    id SERIAL PRIMARY KEY,
    model_name VARCHAR(100) NOT NULL,
    metric_name VARCHAR(50) NOT NULL,
    metric_value DOUBLE PRECISION NOT NULL,
    evaluation_window_start TIMESTAMPTZ NOT NULL,
    evaluation_window_end TIMESTAMPTZ NOT NULL,
    sample_count INTEGER NOT NULL,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_metrics_model_time ON model_metrics (model_name, recorded_at DESC);

-- Air quality observations
CREATE TABLE IF NOT EXISTS airquality_observations (
    id SERIAL,
    timestamp TIMESTAMPTZ NOT NULL,
    source VARCHAR(50) NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    pm25 DOUBLE PRECISION,
    pm10 DOUBLE PRECISION,
    ozone DOUBLE PRECISION,
    no2 DOUBLE PRECISION,
    so2 DOUBLE PRECISION,
    co DOUBLE PRECISION,
    aqi INTEGER,
    aqi_category VARCHAR(50),
    ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id, timestamp)
);

SELECT create_hypertable('airquality_observations', 'timestamp', if_not_exists => TRUE);

-- Continuous aggregates for fast queries
CREATE MATERIALIZED VIEW IF NOT EXISTS hourly_weather_stats
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 hour', timestamp) AS bucket,
    source,
    AVG(temperature_c) AS avg_temp,
    MIN(temperature_c) AS min_temp,
    MAX(temperature_c) AS max_temp,
    AVG(humidity_pct) AS avg_humidity,
    AVG(pressure_hpa) AS avg_pressure,
    AVG(wind_speed_ms) AS avg_wind,
    SUM(precipitation_mm) AS total_precip,
    COUNT(*) AS sample_count
FROM weather_observations
GROUP BY bucket, source
WITH NO DATA;

CREATE MATERIALIZED VIEW IF NOT EXISTS daily_weather_stats
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 day', timestamp) AS bucket,
    source,
    AVG(temperature_c) AS avg_temp,
    MIN(temperature_c) AS min_temp,
    MAX(temperature_c) AS max_temp,
    AVG(humidity_pct) AS avg_humidity,
    AVG(pressure_hpa) AS avg_pressure,
    MAX(wind_speed_ms) AS max_wind,
    SUM(precipitation_mm) AS total_precip,
    COUNT(*) AS sample_count
FROM weather_observations
GROUP BY bucket, source
WITH NO DATA;
