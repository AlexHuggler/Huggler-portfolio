"""Tests for the corpus benchmark runner."""

from __future__ import annotations

from pathlib import Path

import pytest
import yaml

from sql_optimizer import benchmark
from sql_optimizer.benchmark import MissingApiKeyError, run_benchmark
from sql_optimizer.client import Suggestion
from sql_optimizer.explain import CostEstimate

REPO = Path(__file__).resolve().parent.parent
CORPUS = REPO / "corpus" / "queries"
TRUTH = REPO / "corpus" / "ground_truth.yaml"
ALL_KEYWORDS = " ".join(
    kw for q in yaml.safe_load(TRUTH.read_text())["queries"] for kw in q["expected_keywords"]
)


class FakeClient:
    model = "fake-model"
    api_key = "sk-test"

    def __init__(self, rewrite: str = "SELECT 1 /* REWRITE */", reasoning: str = "") -> None:
        self.rewrite = rewrite
        self.reasoning = reasoning
        self.calls: list = []

    def suggest(self, analysis):
        self.calls.append(analysis)
        return Suggestion(rewrite=self.rewrite, reasoning=self.reasoning, confidence="high")


class FakeEngine:
    name = "spark"
    metric = "fake bytes"

    def __init__(self, fail_after: bool = False) -> None:
        self.fail_after = fail_after
        self.calls: list[str] = []

    def estimate(self, sql: str) -> CostEstimate:
        self.calls.append(sql)
        if "REWRITE" in sql:
            if self.fail_after:
                raise RuntimeError("[UNRESOLVED_COLUMN] made_up_col\nstack trace")
            return CostEstimate(bytes_scanned=250.0, metric=self.metric, plan="after-plan")
        return CostEstimate(bytes_scanned=1000.0, metric=self.metric, plan="before-plan")

    def close(self) -> None:
        pass


def test_benchmark_dry_run_over_corpus():
    summary = run_benchmark(corpus_dir=CORPUS, ground_truth_path=TRUTH, dry_run=True)
    # Five fully-written queries; placeholders are skipped.
    assert summary.evaluated == 5
    assert "join_optimization" in summary.by_category
    assert summary.by_category["join_optimization"]["count"] == 1
    assert summary.mode == "heuristic"
    assert summary.cost is None
    assert all(ev.rewrite is None and ev.cost is None for ev in summary.evaluations)


def test_benchmark_skips_placeholder_files(tmp_path: Path):
    placeholder = tmp_path / "99.sql"
    placeholder.write_text("-- TODO: Add benchmark query 99")
    summary = run_benchmark(
        corpus_dir=tmp_path,
        ground_truth_path=tmp_path / "ground_truth.yaml",
        dry_run=True,
    )
    assert summary.evaluated == 0


def test_dry_run_never_builds_a_client(monkeypatch: pytest.MonkeyPatch):
    def _boom(*args, **kwargs):
        raise AssertionError("dry run must not construct the Anthropic client")

    monkeypatch.setattr(benchmark, "AnthropicClient", _boom)
    assert run_benchmark(corpus_dir=CORPUS, ground_truth_path=TRUTH, dry_run=True).evaluated == 5


def test_live_run_without_api_key_fails(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    with pytest.raises(MissingApiKeyError, match="ANTHROPIC_API_KEY"):
        run_benchmark(corpus_dir=CORPUS, ground_truth_path=TRUTH, dry_run=False)


def test_live_run_calls_claude_and_stores_rewrites():
    client = FakeClient(rewrite="SELECT 1 /* REWRITE */", reasoning=ALL_KEYWORDS)
    summary = run_benchmark(
        corpus_dir=CORPUS, ground_truth_path=TRUTH, dry_run=False, client=client
    )
    assert len(client.calls) == 5
    assert summary.mode == "claude"
    assert summary.model == "fake-model"
    for ev in summary.evaluations:
        assert ev.rewrite == "SELECT 1 /* REWRITE */"
        assert ev.reasoning == ALL_KEYWORDS
        assert ev.confidence == "high"
        assert ev.keyword_overlap == 1.0


def test_live_run_scores_only_claude_output():
    # The original query text must not leak into the live score: 01 scores 1.0
    # in dry-run mode on its own SQL, but 0.0 when Claude says nothing relevant.
    summary = run_benchmark(
        corpus_dir=CORPUS, ground_truth_path=TRUTH, dry_run=False, client=FakeClient(rewrite="x")
    )
    assert all(ev.keyword_overlap == 0.0 for ev in summary.evaluations)
    # findings_hit stays the heuristic analyzer's result in both modes.
    assert summary.by_category["partition_pruning"]["findings_hit_rate"] == 0.0
    assert summary.by_category["join_optimization"]["findings_hit_rate"] == 1.0


def test_explain_records_before_and_after_for_matching_engine():
    engine = FakeEngine()
    summary = run_benchmark(
        corpus_dir=CORPUS,
        ground_truth_path=TRUTH,
        dry_run=False,
        client=FakeClient(),
        explain_engine=engine,
    )
    by_id = {ev.query_id: ev for ev in summary.evaluations}
    spark_ids = {"01_join_optimization", "03_cte_flattening", "04_partition_pruning"}
    for qid in spark_ids:
        cost = by_id[qid].cost
        assert (cost.before, cost.after) == (1000.0, 250.0)
        assert cost.reduction == 0.75
        assert cost.direction == "lower"
        assert cost.note == ""
    # Snowflake-tagged queries are skipped by a spark engine, with a reason.
    for qid in {"02_aggregation_rewrite", "05_broadcast_join"}:
        cost = by_id[qid].cost
        assert cost.skipped and cost.before is None and cost.after is None
        assert "engine: snowflake" in cost.note
    assert len(engine.calls) == 6
    assert summary.cost == {
        "engine": "spark",
        "metric": "fake bytes",
        "requested": 3,
        "compared": 3,
        "avg_reduction": 0.75,
        "direction_checked": 3,
        "direction_matches": 3,
    }


def test_explain_failure_is_recorded_not_estimated():
    summary = run_benchmark(
        corpus_dir=CORPUS,
        ground_truth_path=TRUTH,
        dry_run=False,
        client=FakeClient(),
        explain_engine=FakeEngine(fail_after=True),
    )
    cost = summary.evaluations[0].cost
    assert cost.before == 1000.0
    assert cost.after is None
    assert cost.reduction is None
    assert cost.note == "after: RuntimeError: [UNRESOLVED_COLUMN] made_up_col"
    assert summary.cost["compared"] == 0
    assert summary.cost["avg_reduction"] is None


def test_explain_in_dry_run_has_no_after():
    summary = run_benchmark(
        corpus_dir=CORPUS, ground_truth_path=TRUTH, dry_run=True, explain_engine=FakeEngine()
    )
    cost = summary.evaluations[0].cost
    assert cost.before == 1000.0
    assert cost.after is None
    assert cost.note == "after: no rewrite (dry run)"
    assert summary.cost["requested"] == 3
    assert summary.cost["compared"] == 0


def test_explain_skips_empty_rewrite():
    summary = run_benchmark(
        corpus_dir=CORPUS,
        ground_truth_path=TRUTH,
        dry_run=False,
        client=FakeClient(rewrite="  "),
        explain_engine=FakeEngine(),
    )
    assert summary.evaluations[0].cost.note == "after: Claude returned no rewrite"


def test_summary_to_dict_includes_derived_cost_fields():
    summary = run_benchmark(
        corpus_dir=CORPUS,
        ground_truth_path=TRUTH,
        dry_run=False,
        client=FakeClient(),
        explain_engine=FakeEngine(),
    )
    data = benchmark.summary_to_dict(summary)
    first = data["evaluations"][0]
    assert first["rewrite"] == "SELECT 1 /* REWRITE */"
    assert first["cost"]["reduction"] == 0.75
    assert first["cost"]["direction"] == "lower"
    assert first["cost"]["before_plan"] == "before-plan"
