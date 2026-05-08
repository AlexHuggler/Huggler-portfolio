"""Smoke tests for Airflow DAG modules.

We intentionally do not require Airflow at test time; the DAG modules are
written to import cleanly without it. When Airflow is installed (in the docker
image / production), the DAG objects materialize automatically.
"""

from __future__ import annotations

import importlib

import pytest

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
