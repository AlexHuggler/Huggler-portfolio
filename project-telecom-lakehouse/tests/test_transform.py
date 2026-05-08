"""Tests for the local Medallion transforms."""

from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path

import duckdb
from data_generator.generate_cdrs import make_rows, write_partitioned

from lakehouse.transform import bronze_to_silver, raw_to_bronze, silver_to_gold


def test_full_medallion_pipeline(tmp_path: Path):
    raw_dir = tmp_path / "raw"
    bronze_dir = tmp_path / "bronze"
    silver_dir = tmp_path / "silver"
    gold_dir = tmp_path / "gold"

    rows = make_rows(2_000, seed=1, start=datetime(2026, 1, 1, tzinfo=UTC))
    write_partitioned(rows, raw_dir)

    bronze_count = raw_to_bronze(raw_dir, bronze_dir)
    silver_count = bronze_to_silver(bronze_dir, silver_dir)
    gold_counts = silver_to_gold(silver_dir, gold_dir)

    assert bronze_count == 2_000
    # Silver may drop a small number of rows; assert we kept the bulk.
    assert 0 < silver_count <= bronze_count
    assert silver_count >= int(bronze_count * 0.95)
    assert gold_counts["revenue_by_market"] >= 1
    assert gold_counts["arpu_monthly"] >= 1
    assert gold_counts["churn_signals"] >= 1


def test_silver_drops_invalid_rows(tmp_path: Path):
    raw_dir = tmp_path / "raw"
    bronze_dir = tmp_path / "bronze"
    silver_dir = tmp_path / "silver"

    rows = make_rows(500, seed=2, start=datetime(2026, 1, 1, tzinfo=UTC))
    # Inject one invalid row that should be dropped at Silver.
    rows.append(
        {
            **rows[0],
            "cdr_id": "bad-row",
            "caller_msisdn": None,
            "duration_sec": -10,
            "call_type": "VOICE",
        }
    )
    write_partitioned(rows, raw_dir)

    raw_to_bronze(raw_dir, bronze_dir)
    bronze_to_silver(bronze_dir, silver_dir)

    con = duckdb.connect(":memory:")
    silver = con.execute(
        f"SELECT cdr_id FROM '{silver_dir}/cdr.parquet' WHERE cdr_id = 'bad-row'"
    ).fetchall()
    assert silver == []
