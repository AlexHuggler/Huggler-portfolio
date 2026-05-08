"""SQL analyzer: parse with sqlglot and run a small set of heuristic rules.

Findings produced here are independent of any LLM call - they are useful both
as standalone hints and as structured context fed into the Claude prompt.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import StrEnum

import sqlglot
from sqlglot import exp


class Severity(StrEnum):
    INFO = "info"
    WARN = "warn"
    HIGH = "high"


@dataclass(frozen=True)
class Finding:
    rule: str
    message: str
    severity: Severity = Severity.INFO


@dataclass
class AnalysisResult:
    sql: str
    dialect: str
    parsed_ok: bool
    findings: list[Finding] = field(default_factory=list)
    table_count: int = 0
    cte_count: int = 0
    join_count: int = 0


def _has_select_star(tree: exp.Expression) -> bool:
    for select in tree.find_all(exp.Select):
        for projection in select.expressions:
            if isinstance(projection, exp.Star):
                return True
    return False


def _has_cross_join(tree: exp.Expression) -> bool:
    for join in tree.find_all(exp.Join):
        if (join.args.get("kind") or "").upper() == "CROSS":
            return True
        if join.args.get("on") is None and join.args.get("using") is None:
            return True
    return False


def _missing_partition_predicate(tree: exp.Expression, partition_columns: set[str]) -> bool:
    """Return True if no WHERE references one of ``partition_columns``."""
    if not partition_columns:
        return False
    where = next(iter(tree.find_all(exp.Where)), None)
    if where is None:
        return True
    referenced = {col.name.lower() for col in where.find_all(exp.Column)}
    return referenced.isdisjoint({c.lower() for c in partition_columns})


def _has_broadcast_hint(sql: str) -> bool:
    upper = sql.upper()
    return "BROADCAST(" in upper or "/*+ BROADCAST" in upper


def _has_obvious_broadcast_opportunity(tree: exp.Expression) -> bool:
    """Heuristic: any explicit JOIN warrants a "consider broadcast" prompt."""
    return any(True for _ in tree.find_all(exp.Join))


def _count_tables(tree: exp.Expression) -> int:
    return len({t.name.lower() for t in tree.find_all(exp.Table)})


def _count_ctes(tree: exp.Expression) -> int:
    with_node = tree.find(exp.With)
    return len(with_node.expressions) if with_node else 0


def _has_unaliased_correlated_subquery(tree: exp.Expression) -> bool:
    return any(
        sub.parent_select is not None and sub.find(exp.Column) is not None
        for sub in tree.find_all(exp.Subquery)
    )


def analyze(
    sql: str,
    *,
    dialect: str = "spark",
    partition_columns: set[str] | None = None,
) -> AnalysisResult:
    """Parse ``sql`` and produce an :class:`AnalysisResult` with heuristic findings."""
    findings: list[Finding] = []
    parsed_ok = True
    table_count = 0
    cte_count = 0
    join_count = 0

    try:
        tree = sqlglot.parse_one(sql, read=dialect)
    except sqlglot.errors.ParseError as e:
        return AnalysisResult(
            sql=sql,
            dialect=dialect,
            parsed_ok=False,
            findings=[Finding("parse_error", f"sqlglot failed to parse: {e}", Severity.HIGH)],
        )

    if _has_select_star(tree):
        findings.append(
            Finding(
                "select_star",
                "SELECT * fans out columns and disables column pruning. List columns explicitly.",
                Severity.WARN,
            )
        )

    if _has_cross_join(tree):
        findings.append(
            Finding(
                "cross_join",
                "Cross join (or join without ON) detected. Confirm intent or add a join key.",
                Severity.HIGH,
            )
        )

    if _missing_partition_predicate(tree, partition_columns or set()):
        findings.append(
            Finding(
                "missing_partition_predicate",
                "No WHERE predicate filters by a partition column; full table scan likely.",
                Severity.HIGH,
            )
        )

    if _has_obvious_broadcast_opportunity(tree) and not _has_broadcast_hint(sql):
        findings.append(
            Finding(
                "consider_broadcast",
                "Join detected without BROADCAST hint. If one side is small (< ~8MB), broadcast it.",
                Severity.INFO,
            )
        )

    if _has_unaliased_correlated_subquery(tree):
        findings.append(
            Finding(
                "correlated_subquery",
                "Correlated subquery detected. Consider rewriting as a JOIN or windowed expression.",
                Severity.WARN,
            )
        )

    table_count = _count_tables(tree)
    cte_count = _count_ctes(tree)
    join_count = sum(1 for _ in tree.find_all(exp.Join))

    if cte_count > 5:
        findings.append(
            Finding(
                "many_ctes",
                f"{cte_count} CTEs found; some Spark plans benefit from flattening.",
                Severity.INFO,
            )
        )

    return AnalysisResult(
        sql=sql,
        dialect=dialect,
        parsed_ok=parsed_ok,
        findings=findings,
        table_count=table_count,
        cte_count=cte_count,
        join_count=join_count,
    )
