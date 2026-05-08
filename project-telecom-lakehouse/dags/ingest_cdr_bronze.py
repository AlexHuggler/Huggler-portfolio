"""Airflow DAG: ingest raw CDR parquet from MinIO/S3 into the Bronze Iceberg table.

Wired with PythonOperator so the same code path exercised by ``make demo``
(``lakehouse.transform.raw_to_bronze``) is what runs in Airflow. The DAG itself
imports cleanly (``airflow dags list``) without Airflow being installed at
discovery time, since the ``airflow`` import is wrapped.
"""

from __future__ import annotations

from datetime import datetime, timedelta

try:
    from airflow import DAG
    from airflow.operators.python import PythonOperator

    AIRFLOW_AVAILABLE = True
except ImportError:  # pragma: no cover - tested separately
    AIRFLOW_AVAILABLE = False
    DAG = object  # type: ignore[assignment,misc]
    PythonOperator = None  # type: ignore[assignment]


DEFAULT_ARGS = {
    "owner": "data-platform",
    "retries": 2,
    "retry_delay": timedelta(minutes=5),
    "depends_on_past": False,
}


def ingest_to_bronze() -> None:
    """Run the raw->bronze parquet transform."""
    from lakehouse.transform import raw_to_bronze

    raw_to_bronze()


if AIRFLOW_AVAILABLE:
    with DAG(
        dag_id="ingest_cdr_bronze",
        description="Ingest raw CDR parquet into the Bronze Iceberg table",
        default_args=DEFAULT_ARGS,
        start_date=datetime(2026, 1, 1),
        schedule="@hourly",
        catchup=False,
        tags=["telecom", "bronze", "ingest"],
    ) as dag:
        ingest = PythonOperator(
            task_id="raw_to_bronze",
            python_callable=ingest_to_bronze,
        )
