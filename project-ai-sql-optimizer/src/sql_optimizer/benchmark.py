"""Benchmark the analyzer + (optionally) Claude across the corpus.

When ``dry_run=True`` we only run heuristic analysis and score it against
``ground_truth.yaml``. When ``dry_run=False`` we ask Claude for a rewrite of
every query and score the rewrite + its reasoning instead; that path needs
``ANTHROPIC_API_KEY`` and fails fast without it rather than falling back.

Either mode can add an EXPLAIN step (see ``explain.py``): the original and the
rewritten query are explained on a configured engine and the estimated cost
is recorded before and after. A value the engine did not produce stays
``None`` with a note saying why.
"""

from __future__ import annotations

import re
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Protocol

import yaml

from .analyzer import AnalysisResult, analyze
from .client import AnthropicClient, Suggestion
from .explain import ExplainEngine


class MissingApiKeyError(RuntimeError):
    """``dry_run=False`` was requested without ``ANTHROPIC_API_KEY``."""


class SuggestionClient(Protocol):
    def suggest(self, analysis: AnalysisResult) -> Suggestion: ...


@dataclass
class GroundTruthEntry:
    query_id: str
    category: str
    expected_keywords: list[str]
    expected_cost_direction: str  # one of "lower", "higher", "unknown"


@dataclass
class CostComparison:
    """EXPLAIN estimates for one query. ``None`` means the engine gave no number."""

    engine: str
    metric: str
    before: float | None = None
    after: float | None = None
    skipped: bool = False
    note: str = ""
    before_plan: str = ""
    after_plan: str = ""

    @property
    def reduction(self) -> float | None:
        if self.before is None or self.after is None or self.before <= 0:
            return None
        return (self.before - self.after) / self.before

    @property
    def direction(self) -> str | None:
        if self.before is None or self.after is None:
            return None
        if self.after < self.before:
            return "lower"
        if self.after > self.before:
            return "higher"
        return "same"


@dataclass
class QueryEvaluation:
    query_id: str
    category: str
    keyword_overlap: float
    findings_hit: bool
    rewrite: str | None = None
    reasoning: str | None = None
    confidence: str | None = None
    expected_cost_direction: str = "unknown"
    cost: CostComparison | None = None


@dataclass
class BenchmarkSummary:
    evaluated: int
    by_category: dict[str, dict[str, float]] = field(default_factory=dict)
    evaluations: list[QueryEvaluation] = field(default_factory=list)
    mode: str = "heuristic"  # "heuristic" (dry run) or "claude"
    model: str | None = None
    explain_engine: str | None = None
    cost: dict[str, Any] | None = None


def _load_ground_truth(path: Path) -> dict[str, GroundTruthEntry]:
    if not path.exists():
        return {}
    raw = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    out: dict[str, GroundTruthEntry] = {}
    for entry in raw.get("queries", []):
        qid = entry["query_id"]
        out[qid] = GroundTruthEntry(
            query_id=qid,
            category=entry.get("category", "unknown"),
            expected_keywords=[k.lower() for k in entry.get("expected_keywords", [])],
            expected_cost_direction=entry.get("expected_cost_direction", "unknown"),
        )
    return out


def _query_id(path: Path) -> str:
    return path.stem


def _engine_tag(sql: str) -> str | None:
    """The ``-- engine: <name>`` header a corpus query declares, if any."""
    match = re.search(r"^--\s*engine:\s*(\w+)", sql, flags=re.MULTILINE | re.IGNORECASE)
    return match.group(1).lower() if match else None


def _detect_dialect(sql: str) -> str:
    upper = sql.upper()
    if "QUALIFY " in upper or "FLATTEN(" in upper:
        return "snowflake"
    return "spark"


def _score(
    findings: list[str],
    truth: GroundTruthEntry | None,
    *,
    rewrite: str = "",
    reasoning: str = "",
) -> tuple[float, bool]:
    """Score what the tool produced: the heuristic finding messages in a dry run,
    Claude's rewrite and reasoning in a live run.

    The input SQL is deliberately not searched - keywords it already contains
    (table names, JOIN, its comments) would count as hits the tool never earned.
    """
    if truth is None:
        return 0.0, False
    haystack = "\n".join([*findings, rewrite, reasoning]).lower()
    if not truth.expected_keywords:
        return 1.0, True
    hits = sum(1 for kw in truth.expected_keywords if kw in haystack)
    overlap = hits / len(truth.expected_keywords)
    findings_hit = bool(findings)
    return overlap, findings_hit


def describe_error(err: Exception) -> str:
    """``TypeName: first line of the message`` - short enough for a table cell."""
    lines = str(err).strip().splitlines()
    return f"{type(err).__name__}: {lines[0][:200] if lines else ''}".rstrip(": ")


def _compare_cost(engine: ExplainEngine, sql: str, suggestion: Suggestion | None) -> CostComparison:
    cmp = CostComparison(engine=engine.name, metric=engine.metric)
    tag = _engine_tag(sql)
    if tag is not None and tag != engine.name:
        cmp.skipped = True
        cmp.note = f"skipped: query tagged engine: {tag}"
        return cmp

    notes: list[str] = []
    try:
        est = engine.estimate(sql)
        cmp.before, cmp.before_plan = est.bytes_scanned, est.plan
    except Exception as e:  # recorded as a note; never replaced with a number
        notes.append(f"before: {describe_error(e)}")

    if suggestion is None:
        notes.append("after: no rewrite (dry run)")
    elif not suggestion.rewrite.strip():
        notes.append("after: Claude returned no rewrite")
    else:
        try:
            est = engine.estimate(suggestion.rewrite)
            cmp.after, cmp.after_plan = est.bytes_scanned, est.plan
        except Exception as e:
            notes.append(f"after: {describe_error(e)}")
    cmp.note = "; ".join(notes)
    return cmp


def _summarize_cost(engine: ExplainEngine, evaluations: list[QueryEvaluation]) -> dict[str, Any]:
    explained = [ev for ev in evaluations if ev.cost is not None and not ev.cost.skipped]
    compared = [ev for ev in explained if ev.cost.direction is not None]
    reductions = [ev.cost.reduction for ev in compared if ev.cost.reduction is not None]
    checked = [ev for ev in compared if ev.expected_cost_direction in ("lower", "higher")]
    return {
        "engine": engine.name,
        "metric": engine.metric,
        "requested": len(explained),
        "compared": len(compared),
        "avg_reduction": sum(reductions) / len(reductions) if reductions else None,
        "direction_checked": len(checked),
        "direction_matches": sum(
            1 for ev in checked if ev.cost.direction == ev.expected_cost_direction
        ),
    }


def default_client() -> AnthropicClient:
    """The client a live run uses; raises :class:`MissingApiKeyError` without a key."""
    client = AnthropicClient()
    if not client.api_key:
        raise MissingApiKeyError(
            "ANTHROPIC_API_KEY is not set. `benchmark --no-dry-run` asks Claude to "
            "rewrite every query and does not fall back to heuristic scoring. "
            "Set the key, or use --dry-run for the heuristic-only benchmark."
        )
    return client


def run_benchmark(
    corpus_dir: Path,
    ground_truth_path: Path,
    *,
    dry_run: bool = True,
    limit: int = 50,
    client: SuggestionClient | None = None,
    explain_engine: ExplainEngine | None = None,
) -> BenchmarkSummary:
    if not dry_run and client is None:
        client = default_client()

    truth = _load_ground_truth(ground_truth_path)
    evaluations: list[QueryEvaluation] = []

    for sql_path in sorted(corpus_dir.glob("*.sql"))[:limit]:
        qid = _query_id(sql_path)
        sql = sql_path.read_text(encoding="utf-8")
        if sql.strip().startswith("-- TODO"):
            continue
        analysis = analyze(sql, dialect=_detect_dialect(sql))
        finding_msgs = [f.message for f in analysis.findings]
        entry = truth.get(qid)
        overlap, hit = _score(finding_msgs, entry)

        suggestion = None
        if not dry_run:
            suggestion = client.suggest(analysis)
            # Same scorer, but the haystack is Claude's rewrite + reasoning only.
            overlap, _ = _score(
                [], entry, rewrite=suggestion.rewrite, reasoning=suggestion.reasoning
            )

        evaluation = QueryEvaluation(
            query_id=qid,
            category=entry.category if entry else "unknown",
            keyword_overlap=overlap,
            findings_hit=hit,
            rewrite=suggestion.rewrite if suggestion else None,
            reasoning=suggestion.reasoning if suggestion else None,
            confidence=suggestion.confidence if suggestion else None,
            expected_cost_direction=entry.expected_cost_direction if entry else "unknown",
        )
        if explain_engine is not None:
            evaluation.cost = _compare_cost(explain_engine, sql, suggestion)
        evaluations.append(evaluation)

    by_category: dict[str, dict[str, float]] = {}
    for ev in evaluations:
        bucket = by_category.setdefault(
            ev.category, {"count": 0, "keyword_overlap": 0.0, "findings_hit_rate": 0.0}
        )
        bucket["count"] += 1
        bucket["keyword_overlap"] += ev.keyword_overlap
        bucket["findings_hit_rate"] += 1.0 if ev.findings_hit else 0.0

    for stats in by_category.values():
        if stats["count"]:
            stats["keyword_overlap"] /= stats["count"]
            stats["findings_hit_rate"] /= stats["count"]

    return BenchmarkSummary(
        evaluated=len(evaluations),
        by_category=by_category,
        evaluations=evaluations,
        mode="heuristic" if dry_run else "claude",
        model=None if dry_run else getattr(client, "model", None),
        explain_engine=explain_engine.name if explain_engine is not None else None,
        cost=_summarize_cost(explain_engine, evaluations) if explain_engine is not None else None,
    )


def summary_to_dict(summary: BenchmarkSummary) -> dict[str, Any]:
    """JSON-ready dict of a summary, including each comparison's derived fields."""
    out = asdict(summary)
    for ev_out, ev in zip(out["evaluations"], summary.evaluations, strict=True):
        if ev.cost is not None:
            ev_out["cost"]["reduction"] = ev.cost.reduction
            ev_out["cost"]["direction"] = ev.cost.direction
    return out
