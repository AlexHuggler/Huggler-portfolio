"""Smoke tests for Airflow DAG modules.

We intentionally do not require Airflow at test time; the DAG modules are
written to import cleanly without it. When Airflow is installed (in the docker
image / production), the DAG objects materialize automatically.
"""

from __future__ import annotations

import importlib
from pathlib import Path

import pytest
import yaml

PROJECT_DIR = Path(__file__).resolve().parents[1]

DAG_MODULES = (
    "dags.ingest_cdr_bronze",
    "dags.transform_silver",
    "dags.build_gold_marts",
)


@pytest.mark.parametrize("module", DAG_MODULES)
def test_dag_module_imports(module: str):
    mod = importlib.import_module(module)
    assert hasattr(mod, "AIRFLOW_AVAILABLE")
    assert mod.DEFAULT_ARGS["owner"] == "data-platform"


def test_callables_importable():
    from dags.ingest_cdr_bronze import ingest_to_bronze
    from dags.transform_silver import run_bronze_to_silver, run_great_expectations

    assert callable(ingest_to_bronze)
    assert callable(run_bronze_to_silver)
    assert callable(run_great_expectations)


def test_gold_dag_uses_the_compose_dbt_profile():
    """build_gold_marts passes the profile dir the compose image ships, and that profile
    is the one dbt_project.yml names, writing DuckDB to the mounted data/ volume."""
    from dags.build_gold_marts import DBT_PROFILES_DIR

    compose = yaml.safe_load((PROJECT_DIR / "docker-compose.yml").read_text())
    assert compose["x-airflow-common"]["environment"]["DBT_PROFILES_DIR"] == DBT_PROFILES_DIR
    dockerfile = (PROJECT_DIR / "docker/airflow/Dockerfile").read_text()
    assert f"COPY dbt-profiles.yml {DBT_PROFILES_DIR}/profiles.yml" in dockerfile

    profiles = yaml.safe_load((PROJECT_DIR / "docker/airflow/dbt-profiles.yml").read_text())
    project = yaml.safe_load((PROJECT_DIR / "dbt_telecom/dbt_project.yml").read_text())
    profile = profiles[project["profile"]]
    output = profile["outputs"][profile["target"]]
    assert output["type"] == "duckdb"
    assert output["path"].startswith("/opt/airflow/data/")
