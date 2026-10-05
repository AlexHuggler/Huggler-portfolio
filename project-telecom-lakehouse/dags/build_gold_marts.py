"""Airflow DAG: build Gold marts via dbt run + dbt test.

Scheduled on the Silver Dataset rather than a clock: it runs after
``transform_silver`` lands Silver, and never after a Bronze contract failure
(Silver is not produced, so no Dataset event fires).

The Silver Dataset is the trigger, not dbt's input. dbt builds and tests the
whole project, the same as ``make dbt-run`` / ``make dbt-test``: the Bronze views
over ``data/raw``, the Silver tables (``sl_cdr_clean`` mirrors ``bronze_to_silver``
in ``lakehouse.transform``), then the Gold marts. Selecting less fails on a fresh
DuckDB file: the Gold models ``ref()`` the Silver tables, and a Silver
``relationships`` test refs the ``br_account_register`` view, which is not a Gold
ancestor (so ``+gold`` skips it). The profile comes from the compose image
(``docker/airflow/dbt-profiles.yml``).
"""

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
DBT_PROFILES_DIR = "/opt/airflow/dbt_profiles"

if AIRFLOW_AVAILABLE:
    from dags.lakehouse_datasets import SILVER_CDR

    with DAG(
        dag_id="build_gold_marts",
        description="Run dbt to build Gold marts and dbt test to validate them",
        default_args=DEFAULT_ARGS,
        start_date=datetime(2026, 1, 1),
        schedule=[SILVER_CDR],
        catchup=False,
        max_active_runs=1,
        tags=["telecom", "gold", "dbt"],
    ) as dag:
        dbt_run = BashOperator(
            task_id="dbt_run_gold",
            bash_command=f"cd {DBT_PROJECT_DIR} && dbt run --profiles-dir {DBT_PROFILES_DIR}",
        )
        dbt_test = BashOperator(
            task_id="dbt_test_gold",
            bash_command=f"cd {DBT_PROJECT_DIR} && dbt test --profiles-dir {DBT_PROFILES_DIR}",
        )
        dbt_run >> dbt_test
