"""Tests for the synthetic CDR generator."""

from __future__ import annotations

import re
from collections import Counter
from datetime import UTC, datetime
from pathlib import Path

import pyarrow.parquet as pq
import pytest
from data_generator.generate_cdrs import generate, make_rows, make_subscribers, write_partitioned

END = datetime(2026, 1, 3, tzinfo=UTC)


def test_make_rows_yields_expected_shape():
    rows = make_rows(100, seed=1, start=datetime(2026, 1, 1, tzinfo=UTC))
    assert len(rows) == 100
    required = {
        "cdr_id",
        "caller_msisdn",
        "start_time",
        "duration_sec",
        "bytes_used",
        "call_type",
        "market",
        "plan_id",
        "is_roaming",
        "ingest_date",
    }
    for r in rows:
        assert required <= set(r.keys())
        assert r["call_type"] in {"VOICE", "SMS", "DATA"}
        assert r["market"] in {"NORTH", "SOUTH", "EAST", "WEST", "CENTRAL"}
        assert r["plan_id"] in {
            "BASIC_5GB",
            "PRO_25GB",
            "UNLIMITED",
            "FAMILY_50GB",
            "PREPAID",
        }
        assert r["duration_sec"] >= 0


def test_write_partitioned_creates_one_dir_per_date(tmp_path: Path):
    rows = make_rows(60, seed=1, start=datetime(2026, 1, 1, tzinfo=UTC))
    n = write_partitioned(rows, tmp_path)
    assert n == 60
    partitions = sorted(p.name for p in tmp_path.iterdir() if p.is_dir())
    assert all(p.startswith("ingest_date=") for p in partitions)
    # Read back at least one file and assert columns are intact.
    parquets = list(tmp_path.rglob("*.parquet"))
    assert parquets
    table = pq.ParquetFile(parquets[0]).read()
    assert {"cdr_id", "duration_sec"} <= set(table.column_names)


def test_subscriber_pool_is_unique_and_matches_contract():
    pool = make_subscribers(500, seed=3)
    msisdns = [s.msisdn for s in pool]
    assert len(msisdns) == len(set(msisdns)) == 500
    # Same regex as the Bronze GE contract on caller_msisdn.
    assert all(re.fullmatch(r"\+1[0-9]{10}", m) for m in msisdns)
    assert make_subscribers(500, seed=3) == pool


def test_pool_needs_two_subscribers():
    with pytest.raises(ValueError):
        make_subscribers(1, seed=1)


def test_callers_and_callees_come_from_the_pool():
    rows = generate(rows=6_000, days=3, seed=5, subscribers=300, end=END)
    pool = {s.msisdn for s in make_subscribers(300, seed=5)}
    callers = {r["caller_msisdn"] for r in rows}
    assert len(callers) <= 300
    assert callers <= pool
    callees = [r for r in rows if r["callee_msisdn"]]
    assert callees
    assert {r["callee_msisdn"] for r in callees} <= pool
    assert all(r["callee_msisdn"] != r["caller_msisdn"] for r in callees)
    assert all(r["callee_msisdn"] == "" for r in rows if r["call_type"] == "DATA")


def test_subscriber_attributes_are_stable():
    rows = generate(rows=6_000, days=3, seed=5, subscribers=300, end=END)
    attrs: dict[str, set] = {}
    for r in rows:
        attrs.setdefault(r["caller_msisdn"], set()).add((r["plan_id"], r["market"]))
    assert all(len(v) == 1 for v in attrs.values())


def test_generate_is_deterministic():
    a = generate(rows=3_000, days=3, seed=11, subscribers=200, end=END)
    b = generate(rows=3_000, days=3, seed=11, subscribers=200, end=END)
    c = generate(rows=3_000, days=3, seed=12, subscribers=200, end=END)
    assert a == b
    assert [r["cdr_id"] for r in a] != [r["cdr_id"] for r in c]
    assert len({r["cdr_id"] for r in a}) == len(a)


def test_generate_spreads_rows_over_day_partitions_ending_on_end():
    rows = generate(rows=3_000, days=3, seed=11, subscribers=200, end=END)
    assert len(rows) == 3_000
    assert sorted({r["ingest_date"] for r in rows}) == ["2026-01-01", "2026-01-02", "2026-01-03"]


def test_activity_is_skewed_and_some_subscribers_go_quiet():
    rows = generate(rows=12_000, days=3, seed=42, subscribers=400, end=END)
    per_caller = Counter(r["caller_msisdn"] for r in rows)
    counts = sorted(per_caller.values(), reverse=True)
    top_decile = sum(counts[: len(counts) // 10]) / len(rows)
    assert top_decile > 0.25  # a few heavy users carry a large share of traffic
    assert counts[-1] <= 5  # and a tail of light users barely shows up

    days = {r["ingest_date"] for r in rows}
    first, last = min(days), max(days)
    seen: dict[str, set] = {}
    for r in rows:
        seen.setdefault(r["caller_msisdn"], set()).add(r["ingest_date"])
    went_quiet = {s.msisdn for s in make_subscribers(400, seed=42) if s.quiet_after is not None}
    assert went_quiet
    # Subscribers that go quiet are active early and absent from the last day.
    assert all(last not in seen[m] for m in went_quiet if m in seen)
    assert any(first in seen[m] for m in went_quiet if m in seen)
