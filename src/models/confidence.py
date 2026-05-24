import pickle
from pathlib import Path

import numpy as np
import structlog

from src.config.settings import get_settings

logger = structlog.get_logger()
settings = get_settings()


class ConfidenceModel:
    """Estimate prediction confidence (0-100%) for weather forecasts.

    Learns from historical forecast errors to predict how confident
    we should be in a given forecast. Factors include:
    - Lead time (further ahead = less confident)
    - Weather pattern complexity
    - Historical model accuracy for similar conditions
    - Agreement between multiple data sources

    Output: confidence percentage for premium UI display.
    """

    def __init__(self) -> None:
        self.model = None
        self._model_dir = Path(settings.model_dir) / "confidence"
        self._model_dir.mkdir(parents=True, exist_ok=True)

    def train(
        self,
        forecast_features: np.ndarray,
        forecast_errors: np.ndarray,
        error_thresholds: dict[str, float] | None = None,
    ) -> dict[str, float]:
        """Train the confidence model.

        Args:
            forecast_features: shape (n_samples, n_features) — forecast conditions
                Features should include: lead_time_hours, temperature forecast,
                pressure, humidity, wind_speed, cloud_cover, hour_of_day,
                month, source_agreement_score
            forecast_errors: shape (n_samples,) — absolute forecast errors
            error_thresholds: mapping of variable to acceptable error threshold

        Returns:
            Training metrics.
        """
        from sklearn.ensemble import GradientBoostingClassifier

        if error_thresholds is None:
            error_thresholds = {"default": np.median(forecast_errors)}

        threshold = error_thresholds.get("default", np.median(forecast_errors))

        accurate = (forecast_errors <= threshold).astype(int)

        split_point = int(len(forecast_features) * 0.8)
        x_train = forecast_features[:split_point]
        y_train = accurate[:split_point]
        x_val = forecast_features[split_point:]
        y_val = accurate[split_point:]

        model = GradientBoostingClassifier(
            n_estimators=150,
            max_depth=5,
            learning_rate=0.05,
            subsample=0.8,
            min_samples_leaf=20,
        )
        model.fit(x_train, y_train)

        val_probs = model.predict_proba(x_val)[:, 1]
        val_preds = (val_probs >= 0.5).astype(int)
        accuracy = float(np.mean(val_preds == y_val))

        self.model = model
        logger.info("confidence.trained", accuracy=round(accuracy, 4))
        return {"accuracy": accuracy, "threshold": float(threshold)}

    def predict_confidence(self, features: np.ndarray) -> np.ndarray:
        """Predict confidence scores (0-100) for given forecast conditions.

        Args:
            features: shape (n_samples, n_features)

        Returns:
            Confidence percentages (0-100) for each sample.
        """
        if self.model is None:
            return self._heuristic_confidence(features)

        probabilities = self.model.predict_proba(features)[:, 1]
        return np.clip(probabilities * 100, 0, 100)

    def _heuristic_confidence(self, features: np.ndarray) -> np.ndarray:
        """Fallback heuristic when no trained model is available.

        Uses lead time as primary factor:
        - 0-6h: 90-95% confidence
        - 6-24h: 80-90%
        - 24-48h: 70-80%
        - 48-72h: 60-70%
        - 72h+: 40-60%
        """
        n_samples = features.shape[0]
        confidences = np.full(n_samples, 75.0)

        if features.shape[1] > 0:
            lead_times = features[:, 0]
            confidences = np.where(lead_times <= 6, 92.0, confidences)
            confidences = np.where(
                (lead_times > 6) & (lead_times <= 24), 85.0, confidences
            )
            confidences = np.where(
                (lead_times > 24) & (lead_times <= 48), 75.0, confidences
            )
            confidences = np.where(
                (lead_times > 48) & (lead_times <= 72), 65.0, confidences
            )
            confidences = np.where(lead_times > 72, 50.0, confidences)

            noise = np.random.default_rng(42).uniform(-3, 3, n_samples)
            confidences = np.clip(confidences + noise, 0, 100)

        return confidences

    def save(self) -> None:
        if self.model is not None:
            path = self._model_dir / "confidence.pkl"
            with open(path, "wb") as f:
                pickle.dump(self.model, f)
            logger.info("confidence.saved", path=str(path))

    def load(self) -> bool:
        path = self._model_dir / "confidence.pkl"
        if path.exists():
            with open(path, "rb") as f:
                self.model = pickle.load(f)
            logger.info("confidence.loaded", path=str(path))
            return True
        return False
