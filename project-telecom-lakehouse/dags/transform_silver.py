"""Airflow DAG: Bronze -> Silver normalization, gated by the Bronze data contract.

Scheduled on the Bronze Dataset, so it runs when ``ingest_cdr_bronze`` lands
Bronze instead of on its own clock. ``great_expectations_bronze`` runs the
``cdr_bronze_checkpoint``; a failed expectation fails that task, which leaves
``bronze_to_silver`` upstream_failed. Silver is then not produced, its Dataset
event does not fire, and ``build_gold_marts`` does not run.
"""

from __future__ import annotations

from datetime import datetime, timedelta

try:
    from airflow import DAG
    from airflow.operators.python import PythonOperator

    AIRFLOW_AVAILABLE = True
except ImportError:  # pragma: no cover
    AIRFLOW_AVAILABLE = False
    DAG = object  # type: ignore[assignment,misc]
    PythonOperator = None  # type: ignore[assignment]


DEFAULT_ARGS = {
    "owner": "data-platform",
    "retries": 1,
    "retry_delay": timedelta(minutes=2),
}


def run_bronze_to_silver() -> None:
    from lakehouse.transform import bronze_to_silver

    bronze_to_silver()


def run_great_expectations() -> None:
    """Validate the Bronze cdr file against the GE expectations suite."""
    from lakehouse.contract import validate_bronze

    validate_bronze()


if AIRFLOW_AVAILABLE:
    from dags.lakehouse_datasets import BRONZE_CDR, SILVER_CDR

    with DAG(
        dag_id="transform_silver",
        description="Bronze -> Silver normalization with GE data contracts",
        default_args=DEFAULT_ARGS,
        start_date=datetime(2026, 1, 1),
        schedule=[BRONZE_CDR],
        catchup=False,
        max_active_runs=1,
        tags=["telecom", "silver", "transform"],
    ) as dag:
        ge_check = PythonOperator(
            task_id="great_expectations_bronze",
            python_callable=run_great_expectations,
            # A contract failure is deterministic; retrying only delays the alert.
            retries=0,
        )
        transform = PythonOperator(
            task_id="bronze_to_silver",
            python_callable=run_bronze_to_silver,
            outlets=[SILVER_CDR],
        )
        ge_check >> transform
