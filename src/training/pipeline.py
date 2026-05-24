import datetime
from typing import Any

import numpy as np
import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.db.models import ModelMetrics, WeatherForecast, WeatherObservation
from src.models.bias_correction import BiasCorrectionModel
from src.models.confidence import ConfidenceModel
from src.models.forecast import ForecastModel

logger = structlog.get_logger()


class TrainingPipeline:
    """Orchestrates model training, validation, and persistence."""

    def __init__(self) -> None:
        self.bias_model = BiasCorrectionModel(model_type="xgboost")
        self.forecast_model = ForecastModel(backend="sklearn")
        self.confidence_model = ConfidenceModel()

    async def prepare_training_data(
        self,
        session: AsyncSession,
        days_back: int = 365,
    ) -> dict[str, np.ndarray]:
        """Load and prepare training data from the database.

        Joins forecasts with matching observations to compute errors.
        """
        cutoff = datetime.datetime.now(datetime.UTC) - datetime.timedelta(days=days_back)

        obs_query = (
            select(WeatherObservation)
            .where(WeatherObservation.timestamp >= cutoff)
            .where(WeatherObservation.source == "openmeteo")
            .order_by(WeatherObservation.timestamp)
        )
        result = await session.execute(obs_query)
        observations = result.scalars().all()

        fc_query = (
            select(WeatherForecast)
            .where(WeatherForecast.valid_at >= cutoff)
            .order_by(WeatherForecast.valid_at)
        )
        fc_result = await session.execute(fc_query)
        forecasts = fc_result.scalars().all()

        obs_features = self._observations_to_array(observations)
        fc_features = self._forecasts_to_array(forecasts)

        return {
            "observation_features": obs_features,
            "forecast_features": fc_features,
            "observations_raw": observations,
            "forecasts_raw": forecasts,
        }

    async def train_all(
        self,
        session: AsyncSession,
        days_back: int = 365,
    ) -> dict[str, Any]:
        """Run the full training pipeline."""
        data = await self.prepare_training_data(session, days_back)

        results: dict[str, Any] = {}

        obs_features = data["observation_features"]
        fc_features = data["forecast_features"]

        if len(obs_features) > 100 and len(fc_features) > 100:
            min_len = min(len(obs_features), len(fc_features))
            obs_trimmed = obs_features[:min_len]
            fc_trimmed = fc_features[:min_len]

            bias_scores = self.bias_model.train(fc_trimmed, obs_trimmed)
            self.bias_model.save()
            results["bias_correction"] = bias_scores

            forecast_scores = self.forecast_model.train(
                fc_trimmed[:-1], obs_trimmed[1:, 0]
            )
            self.forecast_model.save()
            results["forecast"] = forecast_scores

            errors = np.abs(fc_trimmed[:, 0] - obs_trimmed[:, 0])
            lead_times = np.arange(len(errors)).reshape(-1, 1).astype(float)
            conf_features = np.hstack([lead_times, fc_trimmed])
            conf_scores = self.confidence_model.train(conf_features, errors)
            self.confidence_model.save()
            results["confidence"] = conf_scores

            await self._store_metrics(session, results)
        else:
            logger.warning(
                "training.insufficient_data",
                observations=len(obs_features),
                forecasts=len(fc_features),
            )
            results["status"] = "insufficient_data"

        return results

    def _observations_to_array(self, observations: list) -> np.ndarray:
        rows = []
        for obs in observations:
            ts = obs.timestamp
            row = [
                obs.temperature_c or 0.0,
                obs.humidity_pct or 0.0,
                obs.pressure_hpa or 0.0,
                obs.wind_speed_ms or 0.0,
                obs.precipitation_mm or 0.0,
                obs.wind_direction_deg or 0.0,
                obs.cloud_cover_pct or 0.0,
                np.sin(2 * np.pi * ts.hour / 24),
                np.cos(2 * np.pi * ts.hour / 24),
                np.sin(2 * np.pi * ts.month / 12),
                np.cos(2 * np.pi * ts.month / 12),
                np.sin(2 * np.pi * ts.timetuple().tm_yday / 365),
                np.cos(2 * np.pi * ts.timetuple().tm_yday / 365),
            ]
            rows.append(row)
        return np.array(rows, dtype=np.float64) if rows else np.empty((0, 13))

    def _forecasts_to_array(self, forecasts: list) -> np.ndarray:
        rows = []
        for fc in forecasts:
            ts = fc.valid_at
            row = [
                fc.temperature_c or 0.0,
                fc.humidity_pct or 0.0,
                fc.pressure_hpa or 0.0,
                fc.wind_speed_ms or 0.0,
                fc.precipitation_mm or 0.0,
                fc.wind_direction_deg or 0.0,
                fc.cloud_cover_pct or 0.0,
                np.sin(2 * np.pi * ts.hour / 24),
                np.cos(2 * np.pi * ts.hour / 24),
                np.sin(2 * np.pi * ts.month / 12),
                np.cos(2 * np.pi * ts.month / 12),
                np.sin(2 * np.pi * ts.timetuple().tm_yday / 365),
                np.cos(2 * np.pi * ts.timetuple().tm_yday / 365),
            ]
            rows.append(row)
        return np.array(rows, dtype=np.float64) if rows else np.empty((0, 13))

    async def _store_metrics(
        self,
        session: AsyncSession,
        results: dict[str, Any],
    ) -> None:
        now = datetime.datetime.now(datetime.UTC)
        for model_name, scores in results.items():
            if isinstance(scores, dict):
                for metric_name, value in scores.items():
                    metric = ModelMetrics(
                        model_name=model_name,
                        metric_name=metric_name,
                        metric_value=float(value),
                        evaluation_window_start=now - datetime.timedelta(days=365),
                        evaluation_window_end=now,
                        sample_count=0,
                        recorded_at=now,
                    )
                    session.add(metric)
        await session.commit()
