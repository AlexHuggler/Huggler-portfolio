"""Tests for the anomaly detectors."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from anomaly.detect import (
    amount_zscore_anomaly,
    detect_all,
    geo_anomaly,
    velocity_anomaly,
)


def _ev(account_id: str, ts: datetime, amount: float = 50.0, country: str = "US") -> dict:
    return {
        "event_id": f"{account_id}-{ts.isoformat()}",
        "account_id": account_id,
        "amount": amount,
        "country": country,
        "ts": ts.isoformat(),
    }


def test_velocity_anomaly_fires_above_threshold():
    base = datetime(2025, 1, 1, tzinfo=UTC)
    events = [_ev("A", base + timedelta(seconds=i * 5)) for i in range(8)]
    out = velocity_anomaly(events)
    assert any(a.account_id == "A" and a.kind == "velocity" for a in out)


def test_velocity_anomaly_quiet_below_threshold():
    base = datetime(2025, 1, 1, tzinfo=UTC)
    # 4 events in 4 minutes - below threshold of 5/min.
    events = [_ev("A", base + timedelta(seconds=i * 60)) for i in range(4)]
    out = velocity_anomaly(events)
    assert out == []


def test_geo_anomaly_flags_impossible_travel():
    base = datetime(2025, 1, 1, tzinfo=UTC)
    events = [
        _ev("A", base, country="US"),
        _ev("A", base + timedelta(seconds=90), country="JP"),
    ]
    out = geo_anomaly(events)
    assert len(out) == 1
    assert out[0].kind == "geo"


def test_geo_anomaly_quiet_for_realistic_travel():
    base = datetime(2025, 1, 1, tzinfo=UTC)
    events = [
        _ev("A", base, country="US"),
        _ev("A", base + timedelta(hours=12), country="JP"),
    ]
    out = geo_anomaly(events)
    assert out == []


def test_amount_zscore_flags_outlier():
    base = datetime(2025, 1, 1, tzinfo=UTC)
    events = [_ev("A", base + timedelta(seconds=i), amount=50.0) for i in range(10)]
    events.append(_ev("A", base + timedelta(seconds=11), amount=5000.0))
    out = amount_zscore_anomaly(events)
    assert any(a.kind == "amount" for a in out)


def test_detect_all_returns_combined():
    base = datetime(2025, 1, 1, tzinfo=UTC)
    events = [_ev("A", base + timedelta(seconds=i * 5)) for i in range(8)]
    events += [
        _ev("B", base, country="US"),
        _ev("B", base + timedelta(seconds=30), country="JP"),
    ]
    out = detect_all(events)
    kinds = {a.kind for a in out}
    assert {"velocity", "geo"} <= kinds
