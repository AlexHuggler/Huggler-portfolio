"""Tests for the corpus benchmark runner."""

from __future__ import annotations

from pathlib import Path

from sql_optimizer.benchmark import GroundTruthEntry, _score, run_benchmark

REPO = Path(__file__).resolve().parent.parent


def test_benchmark_dry_run_over_corpus():
    summary = run_benchmark(
        corpus_dir=REPO / "corpus" / "queries",
        ground_truth_path=REPO / "corpus" / "ground_truth.yaml",
        dry_run=True,
    )
    # Five fully-written queries; placeholders are skipped.
    assert summary.evaluated == 5
    assert "join_optimization" in summary.by_category
    assert summary.by_category["join_optimization"]["count"] == 1


def test_benchmark_skips_placeholder_files(tmp_path: Path):
    placeholder = tmp_path / "99.sql"
    placeholder.write_text("-- TODO: Add benchmark query 99")
    summary = run_benchmark(
        corpus_dir=tmp_path,
        ground_truth_path=tmp_path / "ground_truth.yaml",
        dry_run=True,
    )
    assert summary.evaluated == 0


def test_keyword_only_in_query_text_does_not_count(tmp_path: Path):
    # "dim_market" appears in the query (and its comment) but in no finding;
    # "broadcast" appears only in the consider_broadcast finding.
    (tmp_path / "q.sql").write_text(
        "-- dim_market is tiny\n"
        "SELECT f.id FROM fct f JOIN dim_market m ON f.market_id = m.market_id"
    )
    (tmp_path / "ground_truth.yaml").write_text(
        "queries:\n"
        "  - query_id: q\n"
        "    category: broadcast_join\n"
        "    expected_keywords: [broadcast, dim_market]\n"
    )
    summary = run_benchmark(
        corpus_dir=tmp_path,
        ground_truth_path=tmp_path / "ground_truth.yaml",
        dry_run=True,
    )
    [evaluation] = summary.evaluations
    assert evaluation.keyword_overlap == 0.5
    assert evaluation.findings_hit


def test_score_counts_rewrite_and_reasoning():
    truth = GroundTruthEntry(
        query_id="q",
        category="cte_flattening",
        expected_keywords=["single scan", "case when"],
        expected_cost_direction="lower",
    )
    assert _score([], truth) == (0.0, False)
    overlap, hit = _score(
        [],
        truth,
        rewrite="SELECT SUM(CASE WHEN call_type = 'SMS' THEN 1 END) FROM cdr",
        reasoning="Collapses three CTEs into a single scan.",
    )
    assert overlap == 1.0
    assert not hit
