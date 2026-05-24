import pickle
from pathlib import Path

import numpy as np
import structlog
from sklearn.model_selection import TimeSeriesSplit

from src.config.settings import get_settings

logger = structlog.get_logger()
settings = get_settings()

TARGET_VARIABLES = [
    "temperature_c",
    "humidity_pct",
    "pressure_hpa",
    "wind_speed_ms",
    "precipitation_mm",
]

FEATURE_COLUMNS = [
    "temperature_c",
    "humidity_pct",
    "pressure_hpa",
    "wind_speed_ms",
    "wind_direction_deg",
    "precipitation_mm",
    "cloud_cover_pct",
    "hour_sin",
    "hour_cos",
    "month_sin",
    "month_cos",
    "day_of_year_sin",
    "day_of_year_cos",
]


class BiasCorrectionModel:
    """Correct systematic biases in external forecasts for local microclimate.

    Uses XGBoost or LightGBM to learn the mapping:
        external_forecast + temporal_features → local_observation_bias

    This corrects for microclimate effects specific to the target location
    (e.g., Almelo is in a slightly different terrain than the nearest grid point).
    """

    def __init__(self, model_type: str = "xgboost") -> None:
        self.model_type = model_type
        self.models: dict = {}
        self._model_dir = Path(settings.model_dir) / "bias_correction"
        self._model_dir.mkdir(parents=True, exist_ok=True)

    def train(
        self,
        forecast_data: np.ndarray,
        observation_data: np.ndarray,
        feature_names: list[str] | None = None,
    ) -> dict[str, float]:
        """Train bias correction models for each target variable.

        Args:
            forecast_data: shape (n_samples, n_features) — forecast + temporal features
            observation_data: shape (n_samples, n_targets) — actual observations
            feature_names: optional list of feature column names

        Returns:
            Dictionary of {variable: mae_score} on validation set.
        """
        if self.model_type == "xgboost":
            import xgboost as xgb

            model_cls = xgb.XGBRegressor
            model_params = {
                "n_estimators": 200,
                "max_depth": 6,
                "learning_rate": 0.05,
                "subsample": 0.8,
                "colsample_bytree": 0.8,
                "reg_alpha": 0.1,
                "reg_lambda": 1.0,
            }
        else:
            import lightgbm as lgb

            model_cls = lgb.LGBMRegressor
            model_params = {
                "n_estimators": 200,
                "max_depth": 6,
                "learning_rate": 0.05,
                "subsample": 0.8,
                "colsample_bytree": 0.8,
                "reg_alpha": 0.1,
                "reg_lambda": 1.0,
                "verbose": -1,
            }

        tscv = TimeSeriesSplit(n_splits=5)
        scores: dict[str, float] = {}

        for i, target_name in enumerate(TARGET_VARIABLES):
            if i >= observation_data.shape[1]:
                break

            bias = observation_data[:, i] - forecast_data[:, i]

            best_model = None
            best_score = float("inf")

            for train_idx, val_idx in tscv.split(forecast_data):
                x_train = forecast_data[train_idx]
                y_train = bias[train_idx]
                x_val = forecast_data[val_idx]
                y_val = bias[val_idx]

                model = model_cls(**model_params)
                model.fit(x_train, y_train)

                preds = model.predict(x_val)
                mae = float(np.mean(np.abs(preds - y_val)))

                if mae < best_score:
                    best_score = mae
                    best_model = model

            if best_model is not None:
                self.models[target_name] = best_model
                scores[target_name] = best_score
                logger.info(
                    "bias_correction.trained",
                    variable=target_name,
                    mae=round(best_score, 4),
                )

        return scores

    def correct(self, forecast_features: np.ndarray) -> dict[str, np.ndarray]:
        """Apply bias correction to forecast data.

        Args:
            forecast_features: shape (n_samples, n_features) — same format as training

        Returns:
            Dictionary of {variable: corrected_values}
        """
        corrections: dict[str, np.ndarray] = {}

        for i, target_name in enumerate(TARGET_VARIABLES):
            if target_name not in self.models:
                continue

            model = self.models[target_name]
            bias_pred = model.predict(forecast_features)
            corrected = forecast_features[:, i] + bias_pred
            corrections[target_name] = corrected

        return corrections

    def save(self) -> None:
        for name, model in self.models.items():
            path = self._model_dir / f"{name}.pkl"
            with open(path, "wb") as f:
                pickle.dump(model, f)
            logger.info("bias_correction.saved", variable=name, path=str(path))

    def load(self) -> bool:
        loaded = False
        for target_name in TARGET_VARIABLES:
            path = self._model_dir / f"{target_name}.pkl"
            if path.exists():
                with open(path, "rb") as f:
                    self.models[target_name] = pickle.load(f)
                loaded = True
                logger.info("bias_correction.loaded", variable=target_name)
        return loaded
