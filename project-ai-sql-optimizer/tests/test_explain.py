"""Tests for the EXPLAIN cost step - engines are mocked, nothing connects."""

from __future__ import annotations

import json
import sys
from pathlib import Path
from unittest.mock import MagicMock

import pytest

from sql_optimizer.explain import (
    EngineUnavailableError,
    ExplainError,
    SnowflakeExplainEngine,
    SparkExplainEngine,
    engine_from_env,
    parse_snowflake_cost,
    parse_spark_cost,
)

# Shape of real Spark 3.5 `EXPLAIN COST` output: stats on every optimized
# logical node; the physical plan carries none and must be ignored.
SPARK_JOIN_PLAN = """== Optimized Logical Plan ==
Aggregate [product_id#3], [product_id#3, count(1) AS n#0L], Statistics(sizeInBytes=1.5 KiB)
+- Join Inner, (product_id#3 = product_id#20), Statistics(sizeInBytes=2.0 MiB)
   :- Filter (isnotnull(order_date#5) AND (order_date#5 >= 2026-01-01)), Statistics(sizeInBytes=1.0 MiB)
   :  +- Relation spark_catalog.bronze.fct_order_lines[order_id#1,product_id#3,order_date#5] parquet, Statistics(sizeInBytes=1.0 MiB)
   +- Filter isnotnull(product_id#20), Statistics(sizeInBytes=512.0 B)
      +- Relation spark_catalog.bronze.dim_product[product_id#20,name#21] parquet, Statistics(sizeInBytes=512.0 B)

== Physical Plan ==
AdaptiveSparkPlan isFinalPlan=false
+- HashAggregate(keys=[product_id#3], functions=[count(1)])
   +- FileScan parquet bronze.fct_order_lines[order_id#1]
"""

SPARK_CTE_PLAN = """== Optimized Logical Plan ==
WithCTE, Statistics(sizeInBytes=4.0 KiB)
:- CTERelationDef 0, false, Statistics(sizeInBytes=2.0 KiB)
:  +- Relation spark_catalog.silver.cdr[call_type#1,market#2] parquet, Statistics(sizeInBytes=2.0 KiB)
+- Join LeftOuter, (market#2 = market#9), Statistics(sizeInBytes=4.0 KiB)
   :- CTERelationRef 0, true, [market#2], false, Statistics(sizeInBytes=2.0 KiB)
   +- CTERelationRef 0, true, [market#9], false, Statistics(sizeInBytes=2.0 KiB)

== Physical Plan ==
*(1) Project
"""


def test_parse_spark_cost_sums_leaf_relations_only():
    assert parse_spark_cost(SPARK_JOIN_PLAN) == 1.0 * 2**20 + 512.0


def test_parse_spark_cost_skips_cte_references():
    assert parse_spark_cost(SPARK_CTE_PLAN) == 2.0 * 2**10


def test_parse_spark_cost_rejects_default_size_estimate():
    plan = (
        "== Optimized Logical Plan ==\n"
        "Project [a#1], Statistics(sizeInBytes=8.0 EiB)\n"
        "+- HiveTableRelation [`db`.`t`, ...], Statistics(sizeInBytes=8.0 EiB)\n"
    )
    with pytest.raises(ExplainError, match="no size statistics"):
        parse_spark_cost(plan)


def test_parse_spark_cost_surfaces_planning_errors():
    text = (
        "Error occurred during query planning: \n"
        "[TABLE_OR_VIEW_NOT_FOUND] The table or view `bronze`.`dim_product` cannot be found."
    )
    with pytest.raises(ExplainError, match="TABLE_OR_VIEW_NOT_FOUND"):
        parse_spark_cost(text)


def test_parse_spark_cost_requires_statistics():
    with pytest.raises(ExplainError):
        parse_spark_cost("== Physical Plan ==\n*(1) Scan\n")
    with pytest.raises(ExplainError, match="no statistics"):
        parse_spark_cost("== Optimized Logical Plan ==\nLocalRelation <empty>, [a#1]\n")


def test_spark_engine_runs_explain_cost_and_setup(tmp_path: Path):
    session = MagicMock()
    session.sql.return_value.collect.return_value = [(SPARK_JOIN_PLAN,)]
    setup = tmp_path / "setup.sql"
    setup.write_text(
        "-- tables; one per line\nCREATE DATABASE bronze;\nCREATE TABLE bronze.t (a INT);\n-- end\n"
    )

    engine = SparkExplainEngine(session=session, setup_sql=setup)
    est = engine.estimate("SELECT a FROM bronze.t;\n")

    statements = [c.args[0] for c in session.sql.call_args_list]
    assert statements[0] == "CREATE DATABASE bronze"
    assert len(statements) == 3
    assert statements[1] == "CREATE TABLE bronze.t (a INT)"
    assert statements[2] == "EXPLAIN COST SELECT a FROM bronze.t"
    assert est.bytes_scanned == 1.0 * 2**20 + 512.0
    assert est.plan == SPARK_JOIN_PLAN
    engine.close()
    session.stop.assert_not_called()  # caller-owned session stays open


def test_spark_engine_unavailable_without_pyspark(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setitem(sys.modules, "pyspark", None)
    monkeypatch.setitem(sys.modules, "pyspark.sql", None)
    with pytest.raises(EngineUnavailableError, match="pyspark"):
        engine_from_env("spark")


def test_snowflake_engine_reads_bytes_assigned():
    conn = MagicMock()
    cursor = conn.cursor.return_value
    cursor.fetchone.return_value = (
        json.dumps(
            {
                "GlobalStats": {
                    "partitionsTotal": 10,
                    "partitionsAssigned": 2,
                    "bytesAssigned": 4096,
                },
                "Operations": [],
            }
        ),
    )
    engine = SnowflakeExplainEngine(connection=conn)
    est = engine.estimate("SELECT 1;")
    cursor.execute.assert_called_once_with("EXPLAIN USING JSON SELECT 1")
    assert est.bytes_scanned == 4096.0
    engine.close()
    conn.close.assert_not_called()


def test_parse_snowflake_cost_requires_bytes_assigned():
    with pytest.raises(ExplainError, match="bytesAssigned"):
        parse_snowflake_cost(json.dumps({"GlobalStats": {"partitionsTotal": 1}}))
    with pytest.raises(ExplainError, match="not JSON"):
        parse_snowflake_cost("GlobalStats")


def test_snowflake_engine_unavailable_without_env(monkeypatch: pytest.MonkeyPatch):
    for var in ("SNOWFLAKE_ACCOUNT", "SNOWFLAKE_USER", "SNOWFLAKE_PASSWORD"):
        monkeypatch.delenv(var, raising=False)
    with pytest.raises(EngineUnavailableError, match="SNOWFLAKE_ACCOUNT"):
        engine_from_env("snowflake")


def test_engine_from_env_rejects_unknown_engine():
    with pytest.raises(ValueError, match="postgres"):
        engine_from_env("postgres")
