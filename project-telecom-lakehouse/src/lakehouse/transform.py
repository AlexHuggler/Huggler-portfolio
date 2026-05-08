"""Pure-Python Bronze/Silver/Gold transforms backed by DuckDB.

These mirror the production Airflow + Iceberg + dbt path but run in seconds
without a cluster. They are reused by tests and by ``make demo``.
"""

from __future__ import annotations

from pathlib import Path

import duckdb
import typer
from rich.console import Console
from rich.table import Table

app = typer.Typer(help="Local Medallion transforms (Bronze/Silver/Gold)")
console = Console()


RAW_DIR = Path("data/raw")
BRONZE_DIR = Path("data/bronze")
SILVER_DIR = Path("data/silver")
GOLD_DIR = Path("data/gold")


def _con() -> duckdb.DuckDBPyConnection:
    return duckdb.connect(":memory:")


def raw_to_bronze(raw: Path = RAW_DIR, bronze: Path = BRONZE_DIR) -> int:
    """Read raw partitioned parquet, normalize column types, write to Bronze."""
    bronze.mkdir(parents=True, exist_ok=True)
    con = _con()
    con.execute(
        f"""
        COPY (
            SELECT
                cdr_id,
                caller_msisdn,
                NULLIF(callee_msisdn, '') AS callee_msisdn,
                CAST(start_time AS TIMESTAMP) AS start_time,
                CAST(duration_sec AS INTEGER) AS duration_sec,
                CAST(bytes_used AS BIGINT) AS bytes_used,
                UPPER(call_type) AS call_type,
                UPPER(market) AS market,
                plan_id,
                CAST(is_roaming AS BOOLEAN) AS is_roaming,
                CAST(ingest_date AS DATE) AS ingest_date
            FROM read_parquet('{raw}/**/*.parquet', hive_partitioning=true)
        ) TO '{bronze}/cdr.parquet' (FORMAT PARQUET);
        """
    )
    return con.execute(f"SELECT COUNT(*) FROM '{bronze}/cdr.parquet'").fetchone()[0]


def bronze_to_silver(bronze: Path = BRONZE_DIR, silver: Path = SILVER_DIR) -> int:
    """Bronze -> Silver: drop bad rows, derive billable_minutes, normalize roaming flag."""
    silver.mkdir(parents=True, exist_ok=True)
    con = _con()
    con.execute(
        f"""
        COPY (
            SELECT
                cdr_id,
                caller_msisdn,
                callee_msisdn,
                start_time,
                duration_sec,
                CASE WHEN call_type = 'VOICE' THEN ceil(duration_sec / 60.0) ELSE 0 END AS billable_minutes,
                bytes_used,
                ROUND(bytes_used / 1048576.0, 3) AS billable_mb,
                call_type,
                market,
                plan_id,
                COALESCE(is_roaming, FALSE) AS is_roaming,
                ingest_date
            FROM read_parquet('{bronze}/cdr.parquet')
            WHERE caller_msisdn IS NOT NULL
              AND duration_sec >= 0
              AND call_type IN ('VOICE', 'SMS', 'DATA')
        ) TO '{silver}/cdr.parquet' (FORMAT PARQUET);
        """
    )
    return con.execute(f"SELECT COUNT(*) FROM '{silver}/cdr.parquet'").fetchone()[0]


def silver_to_gold(silver: Path = SILVER_DIR, gold: Path = GOLD_DIR) -> dict[str, int]:
    """Build the three Gold marts: revenue_by_market, arpu_monthly, churn_signals."""
    gold.mkdir(parents=True, exist_ok=True)
    con = _con()

    con.execute(
        f"""
        COPY (
            SELECT
                market,
                ingest_date,
                SUM(CASE WHEN call_type = 'VOICE' THEN billable_minutes * 0.05 ELSE 0 END
                  + CASE WHEN call_type = 'DATA' THEN billable_mb * 0.02 ELSE 0 END
                  + CASE WHEN call_type = 'SMS' THEN 0.01 ELSE 0 END) AS revenue_usd,
                COUNT(*) AS event_count
            FROM read_parquet('{silver}/cdr.parquet')
            GROUP BY 1, 2
        ) TO '{gold}/revenue_by_market.parquet' (FORMAT PARQUET);
        """
    )
    con.execute(
        f"""
        COPY (
            WITH per_caller AS (
                SELECT
                    caller_msisdn,
                    plan_id,
                    date_trunc('month', start_time) AS month,
                    SUM(CASE WHEN call_type = 'VOICE' THEN billable_minutes * 0.05 ELSE 0 END
                      + CASE WHEN call_type = 'DATA' THEN billable_mb * 0.02 ELSE 0 END
                      + CASE WHEN call_type = 'SMS' THEN 0.01 ELSE 0 END) AS revenue_usd
                FROM read_parquet('{silver}/cdr.parquet')
                GROUP BY 1, 2, 3
            )
            SELECT
                month,
                plan_id,
                AVG(revenue_usd) AS arpu_usd,
                COUNT(*) AS active_callers
            FROM per_caller
            GROUP BY 1, 2
        ) TO '{gold}/arpu_monthly.parquet' (FORMAT PARQUET);
        """
    )
    con.execute(
        f"""
        COPY (
            WITH per_caller AS (
                SELECT caller_msisdn,
                       MAX(start_time) AS last_event,
                       COUNT(*) AS events_30d,
                       SUM(CASE WHEN is_roaming THEN 1 ELSE 0 END) AS roaming_events
                FROM read_parquet('{silver}/cdr.parquet')
                GROUP BY 1
            )
            SELECT
                caller_msisdn,
                last_event,
                events_30d,
                roaming_events,
                CASE
                    WHEN events_30d <= 1 THEN 'high'
                    WHEN events_30d <= 5 THEN 'medium'
                    ELSE 'low'
                END AS churn_risk
            FROM per_caller
        ) TO '{gold}/churn_signals.parquet' (FORMAT PARQUET);
        """
    )

    counts = {}
    for name in ("revenue_by_market", "arpu_monthly", "churn_signals"):
        counts[name] = con.execute(
            f"SELECT COUNT(*) FROM '{gold}/{name}.parquet'"
        ).fetchone()[0]
    return counts


@app.command("bronze-silver")
def cmd_bronze_silver() -> None:
    bronze = raw_to_bronze()
    silver = bronze_to_silver()
    console.print(f"Bronze rows: {bronze:,}")
    console.print(f"Silver rows: {silver:,}")


@app.command("run-all")
def cmd_run_all() -> None:
    bronze = raw_to_bronze()
    silver = bronze_to_silver()
    gold = silver_to_gold()
    table = Table(title="Medallion row counts")
    table.add_column("Layer")
    table.add_column("Rows", justify="right")
    table.add_row("Bronze", f"{bronze:,}")
    table.add_row("Silver", f"{silver:,}")
    for name, count in gold.items():
        table.add_row(f"Gold / {name}", f"{count:,}")
    console.print(table)


if __name__ == "__main__":
    app()
