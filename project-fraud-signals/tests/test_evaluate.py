"""Unit tests for account-level detector evaluation."""

from anomaly.detect import Anomaly
from anomaly.evaluate import KIND_TO_LABEL, evaluate_accounts


def _event(account_id: str, label: str) -> dict:
    return {
        "event_id": f"ev-{account_id}-{label}",
        "account_id": account_id,
        "amount": 10.0,
        "country": "US",
        "ts": "2026-01-01T00:00:00+00:00",
        "label": label,
    }


def _anomaly(account_id: str, kind: str) -> Anomaly:
    return Anomaly(
        event_id=f"an-{account_id}-{kind}",
        account_id=account_id,
        kind=kind,
        score=1.0,
        detail="test",
    )


def test_perfect_detection_scores_one() -> None:
    events = [_event("a1", "velocity_burst"), _event("a2", "normal")]
    anomalies = [_anomaly("a1", "velocity")]
    scores = {s.kind: s for s in evaluate_accounts(events, anomalies)}
    assert scores["velocity"].precision == 1.0
    assert scores["velocity"].recall == 1.0
    assert scores["velocity"].f1 == 1.0


def test_false_positive_lowers_precision_not_recall() -> None:
    events = [_event("a1", "impossible_travel"), _event("a2", "normal")]
    anomalies = [_anomaly("a1", "geo"), _anomaly("a2", "geo")]
    scores = {s.kind: s for s in evaluate_accounts(events, anomalies)}
    assert scores["geo"].precision == 0.5
    assert scores["geo"].recall == 1.0


def test_missed_account_lowers_recall() -> None:
    events = [_event("a1", "amount_outlier"), _event("a2", "amount_outlier")]
    anomalies = [_anomaly("a1", "amount")]
    scores = {s.kind: s for s in evaluate_accounts(events, anomalies)}
    assert scores["amount"].precision == 1.0
    assert scores["amount"].recall == 0.5


def test_empty_inputs_score_zero_without_dividing() -> None:
    scores = evaluate_accounts([], [])
    assert len(scores) == len(KIND_TO_LABEL)
    for s in scores:
        assert s.precision == 0.0
        assert s.recall == 0.0
        assert s.f1 == 0.0
