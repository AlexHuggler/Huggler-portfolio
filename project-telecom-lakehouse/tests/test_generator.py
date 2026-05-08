"""Tests for the synthetic CDR generator."""

from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path

import pyarrow.parquet as pq
from data_generator.generate_cdrs import make_rows, write_partitioned


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
