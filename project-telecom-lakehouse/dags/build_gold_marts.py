"""Airflow DAG: build Gold marts via dbt run + dbt test."""

from __future__ import annotations

from datetime import datetime, timedelta

try:
    from airflow import DAG
    from airflow.operators.bash import BashOperator

    AIRFLOW_AVAILABLE = True
except ImportError:  # pragma: no cover
    AIRFLOW_AVAILABLE = False
    DAG = object  # type: ignore[assignment,misc]
    BashOperator = None  # type: ignore[assignment]


DEFAULT_ARGS = {
    "owner": "data-platform",
    "retries": 1,
    "retry_delay": timedelta(minutes=2),
}

DBT_PROJECT_DIR = "/opt/airflow/dbt_telecom"
DBT_PROFILES_DIR = "/opt/airflow/dbt_telecom"

if AIRFLOW_AVAILABLE:
    with DAG(
        dag_id="build_gold_marts",
        description="Run dbt to build Gold marts and dbt test to validate them",
        default_args=DEFAULT_ARGS,
        start_date=datetime(2026, 1, 1),
        schedule="@daily",
        catchup=False,
        tags=["telecom", "gold", "dbt"],
    ) as dag:
        dbt_run = BashOperator(
            task_id="dbt_run_gold",
            bash_command=(
                f"cd {DBT_PROJECT_DIR} && "
                f"dbt run --profiles-dir {DBT_PROFILES_DIR} --select gold"
            ),
        )
        dbt_test = BashOperator(
            task_id="dbt_test_gold",
            bash_command=(
                f"cd {DBT_PROJECT_DIR} && "
                f"dbt test --profiles-dir {DBT_PROFILES_DIR} --select gold"
            ),
        )
        dbt_run >> dbt_test
