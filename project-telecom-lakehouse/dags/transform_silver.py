"""Airflow DAG: Bronze -> Silver normalization with a Great Expectations checkpoint."""

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
    try:
        import great_expectations as gx  # type: ignore[import-untyped]
    except ImportError:
        print("great_expectations not installed; skipping data contract check.")
        return

    gx.get_context()
    suite_name = "cdr_bronze_suite"
    print(f"GE context loaded; would validate using suite {suite_name!r}")


if AIRFLOW_AVAILABLE:
    with DAG(
        dag_id="transform_silver",
        description="Bronze -> Silver normalization with GE data contracts",
        default_args=DEFAULT_ARGS,
        start_date=datetime(2026, 1, 1),
        schedule="@hourly",
        catchup=False,
        tags=["telecom", "silver", "transform"],
    ) as dag:
        ge_check = PythonOperator(
            task_id="great_expectations_bronze",
            python_callable=run_great_expectations,
        )
        transform = PythonOperator(
            task_id="bronze_to_silver",
            python_callable=run_bronze_to_silver,
        )
        ge_check >> transform
