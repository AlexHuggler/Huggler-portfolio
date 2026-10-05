"""Test-session setup.

Airflow reads its config the first time it is imported, so point AIRFLOW_HOME at
a throwaway directory before any test module imports it. Without this, running
the suite with the ``airflow`` extra installed writes ``~/airflow/airflow.cfg``.
"""

from __future__ import annotations

import os
import tempfile

os.environ.setdefault("AIRFLOW_HOME", tempfile.mkdtemp(prefix="telecom-lakehouse-airflow-"))
os.environ.setdefault("AIRFLOW__CORE__LOAD_EXAMPLES", "False")

import sys
import types
from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path
from types import SimpleNamespace

import pytest
from data_generator.generate_cdrs import make_rows, write_partitioned

from lakehouse.transform import raw_to_bronze

SUITE_SIZE = 10


@pytest.fixture
def write_bronze(tmp_path: Path) -> Callable[..., Path]:
    """Write generated (or given) CDR rows through raw -> Bronze under ``tmp_path``.

    Bronze lands in ``tmp_path/data/bronze``: the default ``BRONZE_DIR`` once a
    test ``chdir``s into ``tmp_path``.
    """

    def write(rows: list[dict] | None = None) -> Path:
        if rows is None:
            rows = make_rows(300, seed=7, start=datetime(2026, 1, 1, tzinfo=UTC))
        bronze = tmp_path / "data" / "bronze"
        write_partitioned(rows, tmp_path / "raw")
        raw_to_bronze(tmp_path / "raw", bronze)
        return bronze

    return write


@pytest.fixture
def fake_gx(monkeypatch: pytest.MonkeyPatch) -> Callable[..., list[dict]]:
    """Install a stand-in ``great_expectations`` module whose checkpoint result is scripted.

    ``fake_gx(failures=[(expectation_type, column, unexpected_count), ...])`` makes
    those expectations fail and the rest of the 10-expectation suite pass. Returns
    the list of ``run_checkpoint`` kwargs the code under test sent.
    """

    def install(failures: list[tuple[str, str | None, int]] = ()) -> list[dict]:
        results = [
            SimpleNamespace(
                success=False,
                expectation_config=SimpleNamespace(
                    expectation_type=expectation_type,
                    kwargs={"column": column} if column else {},
                ),
                exception_info={"raised_exception": False},
                result={"unexpected_count": unexpected_count},
            )
            for expectation_type, column, unexpected_count in failures
        ]
        results += [SimpleNamespace(success=True)] * (SUITE_SIZE - len(results))
        checkpoint_result = SimpleNamespace(
            success=not failures,
            list_validation_results=lambda: [SimpleNamespace(results=results)],
        )
        calls: list[dict] = []

        class Context:
            def run_checkpoint(self, **kwargs):
                calls.append(kwargs)
                return checkpoint_result

        module = types.ModuleType("great_expectations")
        module.get_context = lambda **_: Context()
        monkeypatch.setitem(sys.modules, "great_expectations", module)
        return calls

    return install
