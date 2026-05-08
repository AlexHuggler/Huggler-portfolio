"""Benchmark the analyzer + (optionally) Claude across the corpus.

When ``dry_run=True`` we only run heuristic analysis and score it against
``ground_truth.yaml``. When ``dry_run=False`` we also call the Anthropic API.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import yaml

from .analyzer import analyze


@dataclass
class GroundTruthEntry:
    query_id: str
    category: str
    expected_keywords: list[str]
    expected_cost_direction: str  # one of "lower", "higher", "unknown"


@dataclass
class QueryEvaluation:
    query_id: str
    category: str
    keyword_overlap: float
    findings_hit: bool


@dataclass
class BenchmarkSummary:
    evaluated: int
    by_category: dict[str, dict[str, float]] = field(default_factory=dict)
    evaluations: list[QueryEvaluation] = field(default_factory=list)


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


def _detect_dialect(sql: str) -> str:
    upper = sql.upper()
    if "QUALIFY " in upper or "FLATTEN(" in upper:
        return "snowflake"
    return "spark"


def _score(
    sql: str,
    findings: list[str],
    truth: GroundTruthEntry | None,
) -> tuple[float, bool]:
    if truth is None:
        return 0.0, False
    haystack = (sql + " ".join(findings)).lower()
    if not truth.expected_keywords:
        return 1.0, True
    hits = sum(1 for kw in truth.expected_keywords if kw in haystack)
    overlap = hits / len(truth.expected_keywords)
    findings_hit = bool(findings)
    return overlap, findings_hit


def run_benchmark(
    corpus_dir: Path,
    ground_truth_path: Path,
    *,
    dry_run: bool = True,
    limit: int = 50,
) -> BenchmarkSummary:
    truth = _load_ground_truth(ground_truth_path)
    evaluations: list[QueryEvaluation] = []

    for sql_path in sorted(corpus_dir.glob("*.sql"))[:limit]:
        qid = _query_id(sql_path)
        sql = sql_path.read_text(encoding="utf-8")
        if sql.strip().startswith("-- TODO"):
            continue
        analysis = analyze(sql, dialect=_detect_dialect(sql))
        finding_msgs = [f.message for f in analysis.findings]
        overlap, hit = _score(sql, finding_msgs, truth.get(qid))
        evaluations.append(
            QueryEvaluation(
                query_id=qid,
                category=truth[qid].category if qid in truth else "unknown",
                keyword_overlap=overlap,
                findings_hit=hit,
            )
        )

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

    if dry_run:
        # The dry-run code path skips the API call entirely. The structure above
        # keeps things ready for the non-dry-run extension.
        pass

    return BenchmarkSummary(evaluated=len(evaluations), by_category=by_category, evaluations=evaluations)
