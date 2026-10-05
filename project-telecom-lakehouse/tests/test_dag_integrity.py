"""DAG-integrity tests: parse the real DAG folder with Airflow and assert the wiring.

Skipped when Airflow isn't installed (the default ``make install``). CI runs them
in the ``dags`` job, which installs the ``airflow`` and ``quality`` extras.
"""

from __future__ import annotations

from pathlib import Path

import pytest

pytest.importorskip("airflow")

from airflow.models import DagBag
from airflow.timetables.interval import CronDataIntervalTimetable
from airflow.timetables.simple import DatasetTriggeredTimetable
from dags.lakehouse_datasets import BRONZE_CDR, SILVER_CDR

from lakehouse.contract import DataContractError

DAGS_DIR = Path(__file__).resolve().parents[1] / "dags"


@pytest.fixture(scope="module")
def dagbag() -> DagBag:
    return DagBag(dag_folder=str(DAGS_DIR), include_examples=False)


def _trigger_uris(dag) -> set[str]:
    if not isinstance(dag.timetable, DatasetTriggeredTimetable):
        return set()
    return {uri for uri, _ in dag.timetable.dataset_condition.iter_datasets()}


def test_dag_folder_imports_without_errors(dagbag: DagBag):
    assert dagbag.import_errors == {}
    assert set(dagbag.dag_ids) == {"ingest_cdr_bronze", "transform_silver", "build_gold_marts"}


def test_each_dag_runs_one_at_a_time(dagbag: DagBag):
    # Each DAG rewrites a single output file; overlapping runs would collide on it.
    assert {dag.dag_id: dag.max_active_runs for dag in dagbag.dags.values()} == {
        "ingest_cdr_bronze": 1,
        "transform_silver": 1,
        "build_gold_marts": 1,
    }


def test_bronze_ingest_is_the_only_clock_driven_dag(dagbag: DagBag):
    ingest = dagbag.dags["ingest_cdr_bronze"]
    assert isinstance(ingest.timetable, CronDataIntervalTimetable)
    assert ingest.timetable.summary in {"@hourly", "0 * * * *"}
    for dag_id in ("transform_silver", "build_gold_marts"):
        assert isinstance(dagbag.dags[dag_id].timetable, DatasetTriggeredTimetable), dag_id


def test_silver_is_triggered_by_bronze_and_gold_by_silver(dagbag: DagBag):
    assert _trigger_uris(dagbag.dags["transform_silver"]) == {BRONZE_CDR.uri}
    assert _trigger_uris(dagbag.dags["build_gold_marts"]) == {SILVER_CDR.uri}


def test_only_the_landing_tasks_emit_datasets(dagbag: DagBag):
    outlets = {
        (dag.dag_id, task.task_id): [outlet.uri for outlet in task.outlets]
        for dag in dagbag.dags.values()
        for task in dag.tasks
        if task.outlets
    }
    assert outlets == {
        ("ingest_cdr_bronze", "raw_to_bronze"): [BRONZE_CDR.uri],
        ("transform_silver", "bronze_to_silver"): [SILVER_CDR.uri],
    }


def test_dags_form_a_bronze_silver_gold_chain(dagbag: DagBag):
    producer = {
        outlet.uri: dag.dag_id
        for dag in dagbag.dags.values()
        for task in dag.tasks
        for outlet in task.outlets
    }
    upstream = {
        dag.dag_id: {producer[uri] for uri in _trigger_uris(dag)}
        for dag in dagbag.dags.values()
        if _trigger_uris(dag)
    }
    assert upstream == {
        "transform_silver": {"ingest_cdr_bronze"},
        "build_gold_marts": {"transform_silver"},
    }


def test_contract_gates_silver(dagbag: DagBag):
    dag = dagbag.dags["transform_silver"]
    ge_task = dag.get_task("great_expectations_bronze")
    transform = dag.get_task("bronze_to_silver")
    assert ge_task.downstream_task_ids == {"bronze_to_silver"}
    assert transform.upstream_task_ids == {"great_expectations_bronze"}
    assert transform.trigger_rule == "all_success"
    assert ge_task.retries == 0


def test_gold_builds_and_tests_the_whole_dbt_project(dagbag: DagBag):
    # A selector such as `gold` or `+gold` fails on a fresh DuckDB file: Gold refs the
    # Silver tables, and a Silver relationships test refs a Bronze view outside +gold.
    dag = dagbag.dags["build_gold_marts"]
    run, test = dag.get_task("dbt_run_gold"), dag.get_task("dbt_test_gold")
    assert run.downstream_task_ids == {"dbt_test_gold"}
    for task, verb in ((run, "run"), (test, "test")):
        assert f"dbt {verb} --profiles-dir /opt/airflow/dbt_profiles" in task.bash_command
        assert "--select" not in task.bash_command


def test_failing_expectation_fails_the_ge_task(
    dagbag: DagBag, fake_gx, write_bronze, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    write_bronze()
    monkeypatch.chdir(tmp_path)
    monkeypatch.delenv("LAKEHOUSE_ENFORCE_CONTRACT", raising=False)
    calls = fake_gx(failures=[("expect_column_values_to_be_in_set", "market", 3)])

    ge_task = dagbag.dags["transform_silver"].get_task("great_expectations_bronze")
    with pytest.raises(DataContractError, match=r"expect_column_values_to_be_in_set\(market\)"):
        ge_task.execute(context={})
    assert calls[0]["checkpoint_name"] == "cdr_bronze_checkpoint"


def test_passing_contract_lets_the_ge_task_succeed(
    dagbag: DagBag, fake_gx, write_bronze, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    write_bronze()
    monkeypatch.chdir(tmp_path)
    monkeypatch.delenv("LAKEHOUSE_ENFORCE_CONTRACT", raising=False)
    calls = fake_gx()

    ge_task = dagbag.dags["transform_silver"].get_task("great_expectations_bronze")
    ge_task.execute(context={})
    assert len(calls) == 1
