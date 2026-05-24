import numpy as np

from src.models.confidence import ConfidenceModel


class TestConfidenceModel:
    def test_heuristic_confidence(self) -> None:
        model = ConfidenceModel()
        features = np.array([
            [0],    # 0 hours
            [3],    # 3 hours
            [12],   # 12 hours
            [36],   # 36 hours
            [60],   # 60 hours
            [96],   # 96 hours
        ], dtype=float)

        confidences = model._heuristic_confidence(features)

        assert len(confidences) == 6
        assert all(0 <= c <= 100 for c in confidences)
        # Shorter lead times should have higher confidence
        assert confidences[0] > confidences[3]
        assert confidences[1] > confidences[4]

    def test_predict_without_training(self) -> None:
        model = ConfidenceModel()
        features = np.array([[6.0] + [0.0] * 12])
        result = model.predict_confidence(features)
        assert len(result) == 1
        assert 0 <= result[0] <= 100

    def test_train_and_predict(self) -> None:
        rng = np.random.default_rng(42)
        n = 300
        features = rng.standard_normal((n, 10))
        features[:, 0] = np.arange(n)  # lead time
        errors = np.abs(rng.standard_normal(n))

        model = ConfidenceModel()
        metrics = model.train(features, errors)

        assert "accuracy" in metrics
        assert 0 <= metrics["accuracy"] <= 1

        preds = model.predict_confidence(features[:5])
        assert len(preds) == 5
        assert all(0 <= p <= 100 for p in preds)
