"""Tests for the synthetic event producer."""

from __future__ import annotations

import json
from datetime import UTC
from pathlib import Path

from producer.generate import (
    amount_outlier,
    event_stream,
    impossible_travel,
    make_accounts,
    velocity_burst,
    write_jsonl,
)


def test_make_accounts_is_deterministic():
    a = make_accounts(5, seed=1)
    b = make_accounts(5, seed=1)
    assert [acc.account_id for acc in a] == [acc.account_id for acc in b]


def test_event_stream_roughly_hits_target_rate():
    accounts = make_accounts(20, seed=1)
    events = list(
        event_stream(accounts, rate_per_sec=20, duration_sec=2, fraud_rate=0.0, seed=1)
    )
    # rate_per_sec * duration is the *normal* count; fraud injection can multiply.
    assert 30 < len(events) < 200
    for e in events:
        assert {"event_id", "account_id", "amount", "ts", "country"} <= set(e.keys())
        assert e["amount"] > 0


def test_velocity_burst_emits_multiple_events_for_same_account():
    accounts = make_accounts(1, seed=1)
    import random
    from datetime import datetime

    events = velocity_burst(accounts[0], datetime.now(UTC), random.Random(1))
    assert len(events) >= 5
    assert len({e["account_id"] for e in events}) == 1


def test_impossible_travel_changes_country():
    accounts = make_accounts(1, seed=1)
    import random
    from datetime import datetime

    events = impossible_travel(accounts[0], datetime.now(UTC), random.Random(1))
    assert events[0]["country"] != events[1]["country"]


def test_amount_outlier_is_above_mean():
    accounts = make_accounts(1, seed=1)
    import random
    from datetime import datetime

    ev = amount_outlier(accounts[0], datetime.now(UTC), random.Random(1))
    assert ev["amount"] > accounts[0].mean_amount


def test_write_jsonl_round_trips(tmp_path: Path):
    accounts = make_accounts(5, seed=1)
    events = event_stream(accounts, rate_per_sec=20, duration_sec=1, fraud_rate=0.0, seed=1)
    out = tmp_path / "events.jsonl"
    n = write_jsonl(events, out)
    assert n > 0
    rows = [json.loads(line) for line in out.read_text().splitlines()]
    assert len(rows) == n
