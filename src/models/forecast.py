import pickle
from collections.abc import Callable
from pathlib import Path
from typing import Literal

import numpy as np
import structlog

from src.config.settings import get_settings

logger = structlog.get_logger()
settings = get_settings()


class ForecastModel:
    """Time-series forecast model for weather variables.

    Supports multiple backends:
    - 'sklearn': Simple baseline using gradient boosting (always available)
    - 'nbeats': N-BEATS neural architecture (requires pytorch + neuralforecast)
    - 'tft': Temporal Fusion Transformer (requires pytorch + neuralforecast)
    - 'lstm': LSTM-based model (requires pytorch)

    Start with 'sklearn' for immediate results, then upgrade to neural models
    once sufficient historical data is available.
    """

    def __init__(
        self,
        backend: Literal["sklearn", "nbeats", "tft", "lstm"] = "sklearn",
        forecast_horizon: int = 168,
    ) -> None:
        self.backend = backend
        self.forecast_horizon = forecast_horizon
        self.model = None
        self._model_dir = Path(settings.model_dir) / "forecast"
        self._model_dir.mkdir(parents=True, exist_ok=True)

    def train(
        self,
        features: np.ndarray,
        targets: np.ndarray,
        feature_names: list[str] | None = None,
    ) -> dict[str, float]:
        """Train the forecast model.

        Args:
            features: shape (n_samples, n_features) — lagged values + temporal features
            targets: shape (n_samples,) — next-step values to predict
            feature_names: optional feature column names

        Returns:
            Dictionary with training metrics.
        """
        if self.backend == "sklearn":
            return self._train_sklearn(features, targets)
        else:
            logger.warning(
                "forecast.backend_not_implemented",
                backend=self.backend,
                msg="Falling back to sklearn",
            )
            return self._train_sklearn(features, targets)

    def _train_sklearn(
        self, features: np.ndarray, targets: np.ndarray
    ) -> dict[str, float]:
        from sklearn.ensemble import GradientBoostingRegressor
        from sklearn.model_selection import TimeSeriesSplit

        tscv = TimeSeriesSplit(n_splits=5)
        best_model = None
        best_mae = float("inf")
        all_maes: list[float] = []

        for train_idx, val_idx in tscv.split(features):
            x_train, x_val = features[train_idx], features[val_idx]
            y_train, y_val = targets[train_idx], targets[val_idx]

            model = GradientBoostingRegressor(
                n_estimators=200,
                max_depth=6,
                learning_rate=0.05,
                subsample=0.8,
                min_samples_leaf=10,
            )
            model.fit(x_train, y_train)

            preds = model.predict(x_val)
            mae = float(np.mean(np.abs(preds - y_val)))
            all_maes.append(mae)

            if mae < best_mae:
                best_mae = mae
                best_model = model

        self.model = best_model
        avg_mae = float(np.mean(all_maes))
        logger.info("forecast.trained", backend="sklearn", mae=round(avg_mae, 4))
        return {"mae": avg_mae, "best_mae": best_mae}

    def predict(self, features: np.ndarray) -> np.ndarray:
        """Generate forecasts from input features.

        Args:
            features: shape (n_samples, n_features)

        Returns:
            Predictions array of shape (n_samples,)
        """
        if self.model is None:
            raise RuntimeError("Model not trained or loaded. Call train() or load() first.")

        return self.model.predict(features)

    def predict_multi_step(
        self,
        initial_features: np.ndarray,
        steps: int,
        update_fn: Callable[..., np.ndarray] | None = None,
    ) -> np.ndarray:
        """Recursive multi-step forecast.

        Args:
            initial_features: shape (1, n_features) — initial state
            steps: number of forecast steps
            update_fn: function to update features after each step

        Returns:
            Array of shape (steps,) with predicted values
        """
        if self.model is None:
            raise RuntimeError("Model not trained or loaded.")

        predictions = np.zeros(steps)
        current = initial_features.copy()

        for i in range(steps):
            pred = self.model.predict(current)[0]
            predictions[i] = pred
            if update_fn is not None:
                current = update_fn(current, pred, i)

        return predictions

    def save(self) -> None:
        if self.model is not None:
            path = self._model_dir / f"forecast_{self.backend}.pkl"
            with open(path, "wb") as f:
                pickle.dump(self.model, f)
            logger.info("forecast.saved", path=str(path))

    def load(self) -> bool:
        path = self._model_dir / f"forecast_{self.backend}.pkl"
        if path.exists():
            with open(path, "rb") as f:
                self.model = pickle.load(f)
            logger.info("forecast.loaded", path=str(path))
            return True
        return False
