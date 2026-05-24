import numpy as np

from src.models.bias_correction import BiasCorrectionModel


class TestBiasCorrectionModel:
    def test_train_and_correct(self) -> None:
        rng = np.random.default_rng(42)
        n_samples = 500

        forecast = rng.standard_normal((n_samples, 13)) * 5 + 15
        bias = np.column_stack(
            [rng.standard_normal(n_samples) * 0.5 for _ in range(5)]
        )
        observations = forecast[:, :5] + bias

        model = BiasCorrectionModel(model_type="xgboost")
        scores = model.train(forecast, observations)

        assert len(scores) > 0
        for _variable, mae in scores.items():
            assert mae >= 0

        corrections = model.correct(forecast[:10])
        assert len(corrections) > 0

    def test_correct_without_training(self) -> None:
        model = BiasCorrectionModel()
        features = np.random.default_rng(42).standard_normal((5, 13))
        corrections = model.correct(features)
        assert len(corrections) == 0
