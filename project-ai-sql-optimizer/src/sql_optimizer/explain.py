"""Optional EXPLAIN cost step: ask a real engine what a query would cost.

Two engines are supported. Both are opt-in and imported lazily, so the base
install (and CI) never needs them:

- ``spark``: a local SparkSession runs ``EXPLAIN COST <sql>``. The estimate is
  the sum of ``Statistics(sizeInBytes=...)`` over the leaf nodes of the
  optimized logical plan - Spark's estimate of the bytes the query reads.
- ``snowflake``: a connection built from ``SNOWFLAKE_*`` env vars runs
  ``EXPLAIN USING JSON <sql>``. The estimate is ``GlobalStats.bytesAssigned``.

Both report estimated bytes scanned, so a before/after pair is like-for-like
within one engine. Nothing here invents a number: when the engine cannot
produce an estimate, :meth:`ExplainEngine.estimate` raises and the caller
records why.
"""

from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol

ENGINES = ("spark", "snowflake")

SPARK_METRIC = "estimated bytes scanned (sum of leaf sizeInBytes, EXPLAIN COST)"
SNOWFLAKE_METRIC = "estimated bytes scanned (EXPLAIN USING JSON GlobalStats.bytesAssigned)"

SNOWFLAKE_REQUIRED_ENV = ("SNOWFLAKE_ACCOUNT", "SNOWFLAKE_USER", "SNOWFLAKE_PASSWORD")
SNOWFLAKE_OPTIONAL_ENV = {
    "warehouse": "SNOWFLAKE_WAREHOUSE",
    "database": "SNOWFLAKE_DATABASE",
    "schema": "SNOWFLAKE_SCHEMA",
    "role": "SNOWFLAKE_ROLE",
}


class EngineUnavailableError(RuntimeError):
    """The requested engine is not configured (optional dependency or env missing)."""


class ExplainError(RuntimeError):
    """EXPLAIN ran but produced no usable cost estimate."""


@dataclass
class CostEstimate:
    bytes_scanned: float
    metric: str
    plan: str


class ExplainEngine(Protocol):
    name: str
    metric: str

    def estimate(self, sql: str) -> CostEstimate: ...

    def close(self) -> None: ...


def _strip_trailing_semicolons(sql: str) -> str:
    return re.sub(r"[;\s]+$", "", sql.strip())


def _split_statements(text: str) -> list[str]:
    """Split a setup script on ``;`` after dropping whole-line ``--`` comments.

    Deliberately simple: a ``;`` inside a string literal or after code on the
    same line as a comment is not supported.
    """
    code = "\n".join(ln for ln in text.splitlines() if not ln.lstrip().startswith("--"))
    return [stmt.strip() for stmt in code.split(";") if stmt.strip()]


# --------------------------------------------------------------------------- #
# Spark

_UNITS = {
    "B": 1,
    "KiB": 1 << 10,
    "MiB": 1 << 20,
    "GiB": 1 << 30,
    "TiB": 1 << 40,
    "PiB": 1 << 50,
    "EiB": 1 << 60,
}
_SIZE = re.compile(
    r"Statistics\(sizeInBytes=([0-9.]+(?:E[+-]?[0-9]+)?) (B|KiB|MiB|GiB|TiB|PiB|EiB)"
)
_TREE_PREFIX = re.compile(r"^[ :+-]*")
# spark.sql.defaultSizeInBytes (Long.MaxValue) prints as 8.0 EiB: "no statistics".
_DEFAULT_SIZE = "8.0 EiB"
_PLANNING_ERROR = "Error occurred during query planning"


def parse_spark_cost(text: str) -> float:
    """Sum ``sizeInBytes`` over the leaf nodes of an EXPLAIN COST optimized plan.

    Spark prints sizes at one decimal per unit (``1.2 KiB``), so the result is
    as precise as EXPLAIN's own output. ``CTERelationRef`` leaves are skipped:
    the referenced definition's scan is already counted under ``CTERelationDef``.
    """
    if _PLANNING_ERROR in text:
        detail = text.split(_PLANNING_ERROR, 1)[1].strip(" :\n").splitlines()
        raise ExplainError(f"Spark could not plan the query: {detail[0] if detail else ''}")

    marker = "== Optimized Logical Plan =="
    if marker not in text:
        raise ExplainError("EXPLAIN COST output has no optimized logical plan")
    section = text.split(marker, 1)[1].split("\n==", 1)[0]

    nodes: list[tuple[int, str]] = []
    for line in section.splitlines():
        if not line.strip():
            continue
        depth = len(_TREE_PREFIX.match(line).group(0)) // 3
        nodes.append((depth, line))
    if not nodes:
        raise ExplainError("EXPLAIN COST optimized logical plan is empty")

    total = 0.0
    for i, (depth, line) in enumerate(nodes):
        is_leaf = i + 1 == len(nodes) or nodes[i + 1][0] <= depth
        if not is_leaf or "CTERelationRef" in line:
            continue
        match = _SIZE.search(line)
        if match is None:
            raise ExplainError(f"leaf node has no statistics: {line.strip()[:120]}")
        if f"{match.group(1)} {match.group(2)}" == _DEFAULT_SIZE:
            raise ExplainError(
                f"leaf node has no size statistics (Spark default {_DEFAULT_SIZE}): "
                f"{line.strip()[:120]}"
            )
        total += float(match.group(1)) * _UNITS[match.group(2)]
    return total


class SparkExplainEngine:
    name = "spark"
    metric = SPARK_METRIC

    def __init__(self, session: Any = None, setup_sql: Path | None = None) -> None:
        self._owns_session = session is None
        self._session = session if session is not None else self._start_session()
        if setup_sql is not None:
            for statement in _split_statements(setup_sql.read_text(encoding="utf-8")):
                self._session.sql(statement)

    @staticmethod
    def _start_session() -> Any:
        try:
            from pyspark.sql import SparkSession
        except ImportError as e:
            raise EngineUnavailableError(
                "pyspark is not installed; run `uv sync --extra dev --extra spark`"
            ) from e
        master = os.environ.get("SQL_OPTIMIZER_SPARK_MASTER", "local[*]")
        return SparkSession.builder.master(master).appName("sql-optimizer-explain").getOrCreate()

    def estimate(self, sql: str) -> CostEstimate:
        rows = self._session.sql(f"EXPLAIN COST {_strip_trailing_semicolons(sql)}").collect()
        plan = "\n".join(str(row[0]) for row in rows)
        return CostEstimate(bytes_scanned=parse_spark_cost(plan), metric=self.metric, plan=plan)

    def close(self) -> None:
        if self._owns_session:
            self._session.stop()


# --------------------------------------------------------------------------- #
# Snowflake


def parse_snowflake_cost(plan: str) -> float:
    """Read ``GlobalStats.bytesAssigned`` from ``EXPLAIN USING JSON`` output."""
    try:
        data = json.loads(plan)
    except json.JSONDecodeError as e:
        raise ExplainError(f"EXPLAIN USING JSON output is not JSON: {e}") from e
    stats = data.get("GlobalStats") or {}
    if stats.get("bytesAssigned") is None:
        raise ExplainError("EXPLAIN USING JSON output has no GlobalStats.bytesAssigned")
    return float(stats["bytesAssigned"])


def _snowflake_connect() -> Any:
    missing = [var for var in SNOWFLAKE_REQUIRED_ENV if not os.environ.get(var)]
    if missing:
        raise EngineUnavailableError(f"Snowflake is not configured; set {', '.join(missing)}")
    try:
        import snowflake.connector
    except ImportError as e:
        raise EngineUnavailableError(
            "snowflake-connector-python is not installed; run "
            "`uv sync --extra dev --extra snowflake`"
        ) from e
    kwargs = {
        "account": os.environ["SNOWFLAKE_ACCOUNT"],
        "user": os.environ["SNOWFLAKE_USER"],
        "password": os.environ["SNOWFLAKE_PASSWORD"],
    }
    for key, var in SNOWFLAKE_OPTIONAL_ENV.items():
        if os.environ.get(var):
            kwargs[key] = os.environ[var]
    return snowflake.connector.connect(**kwargs)


class SnowflakeExplainEngine:
    name = "snowflake"
    metric = SNOWFLAKE_METRIC

    def __init__(self, connection: Any = None, setup_sql: Path | None = None) -> None:
        self._owns_connection = connection is None
        self._conn = connection if connection is not None else _snowflake_connect()
        if setup_sql is not None:
            for statement in _split_statements(setup_sql.read_text(encoding="utf-8")):
                self._execute(statement)

    def _execute(self, statement: str) -> Any:
        cur = self._conn.cursor()
        try:
            cur.execute(statement)
            return cur.fetchone()
        finally:
            cur.close()

    def estimate(self, sql: str) -> CostEstimate:
        row = self._execute(f"EXPLAIN USING JSON {_strip_trailing_semicolons(sql)}")
        if not row:
            raise ExplainError("EXPLAIN USING JSON returned no rows")
        plan = str(row[0])
        return CostEstimate(bytes_scanned=parse_snowflake_cost(plan), metric=self.metric, plan=plan)

    def close(self) -> None:
        if self._owns_connection:
            self._conn.close()


def engine_from_env(name: str, *, setup_sql: Path | None = None) -> ExplainEngine:
    """Build and connect the named engine, or raise :class:`EngineUnavailableError`."""
    if name == "spark":
        return SparkExplainEngine(setup_sql=setup_sql)
    if name == "snowflake":
        return SnowflakeExplainEngine(setup_sql=setup_sql)
    raise ValueError(f"unknown EXPLAIN engine {name!r}; expected one of {', '.join(ENGINES)}")
