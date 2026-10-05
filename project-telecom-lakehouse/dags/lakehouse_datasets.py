"""Airflow Datasets that link the medallion DAGs.

``ingest_cdr_bronze`` produces ``BRONZE_CDR``, which triggers ``transform_silver``;
``transform_silver`` produces ``SILVER_CDR``, which triggers ``build_gold_marts``.
The URIs name the files the transforms write inside the Airflow container (the
task working directory is ``/opt/airflow``, where ``./data`` is mounted).
Each file has a single writer, so every DAG runs with ``max_active_runs=1``.

Not named ``datasets.py``: Airflow puts the DAG folder on ``sys.path``, where
that name would shadow the HuggingFace ``datasets`` package.
"""

from __future__ import annotations

from airflow.datasets import Dataset

BRONZE_CDR = Dataset("file:///opt/airflow/data/bronze/cdr.parquet")
SILVER_CDR = Dataset("file:///opt/airflow/data/silver/cdr.parquet")
