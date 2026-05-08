"""Tests for the corpus benchmark runner."""

from __future__ import annotations

from pathlib import Path

from sql_optimizer.benchmark import run_benchmark

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
