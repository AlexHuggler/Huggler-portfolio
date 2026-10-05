"""End-to-end tests for the Typer CLI."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from typer.testing import CliRunner

from sql_optimizer.cli import app


@pytest.fixture
def runner() -> CliRunner:
    return CliRunner()


def test_cli_help_lists_commands(runner: CliRunner):
    result = runner.invoke(app, ["--help"])
    assert result.exit_code == 0
    assert "analyze" in result.output
    assert "benchmark" in result.output


def test_cli_analyze_dry_run(runner: CliRunner, tmp_path: Path):
    sql_file = tmp_path / "q.sql"
    sql_file.write_text("SELECT * FROM events WHERE region = 'US'")
    result = runner.invoke(
        app,
        ["analyze", str(sql_file), "--dry-run", "--partition-columns", "ingest_date"],
    )
    assert result.exit_code == 0, result.output
    assert "select_star" in result.output
    assert "missing_partition_predicate" in result.output


def test_cli_analyze_uses_engine_header(runner: CliRunner, tmp_path: Path):
    sql_file = tmp_path / "q.sql"
    sql_file.write_text("-- engine: snowflake\nSELECT id FROM events")
    result = runner.invoke(app, ["analyze", str(sql_file), "--dry-run"])
    assert result.exit_code == 0, result.output
    assert "Analyzer findings (snowflake)" in result.output


def test_cli_analyze_missing_file_errors(runner: CliRunner, tmp_path: Path):
    result = runner.invoke(app, ["analyze", str(tmp_path / "nope.sql"), "--dry-run"])
    assert result.exit_code != 0


REPO = Path(__file__).resolve().parent.parent
CORPUS_ARGS = [
    "--corpus-dir",
    str(REPO / "corpus" / "queries"),
    "--ground-truth",
    str(REPO / "corpus" / "ground_truth.yaml"),
]


class _FakeAnthropicClient:
    model = "fake-model"
    api_key = "sk-test"

    def suggest(self, analysis):
        from sql_optimizer.client import Suggestion

        return Suggestion(rewrite="SELECT 1", reasoning="broadcast", confidence="high")


def test_cli_benchmark_dry_run_keeps_four_column_table(runner: CliRunner):
    # scripts/measure.py in portfolio-site parses exactly these four columns.
    result = runner.invoke(app, ["benchmark", "--dry-run", *CORPUS_ARGS])
    assert result.exit_code == 0, result.output
    rows = [
        [c.strip() for c in line.strip("│").split("│")]
        for line in result.output.splitlines()
        if line.startswith("│")
    ]
    assert len(rows) == 5 and all(len(r) == 4 for r in rows)
    assert ["join_optimization", "1", "1.00", "1.00"] in rows
    assert "EXPLAIN step not run" in result.output


def test_cli_benchmark_no_dry_run_without_key_fails(
    runner: CliRunner, monkeypatch: pytest.MonkeyPatch
):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    result = runner.invoke(app, ["benchmark", "--no-dry-run", *CORPUS_ARGS])
    assert result.exit_code == 2
    assert "ANTHROPIC_API_KEY" in result.output
    assert "Benchmark over" not in result.output


def test_cli_benchmark_no_dry_run_calls_client(
    runner: CliRunner, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
):
    monkeypatch.setattr("sql_optimizer.benchmark.AnthropicClient", _FakeAnthropicClient)
    out = tmp_path / "results" / "live.json"
    result = runner.invoke(app, ["benchmark", "--no-dry-run", *CORPUS_ARGS, "--output", str(out)])
    assert result.exit_code == 0, result.output
    assert "fake-model" in result.output
    data = json.loads(out.read_text())
    assert data["mode"] == "claude"
    assert data["evaluations"][0]["rewrite"] == "SELECT 1"
    assert data["explain_skipped"] is None


def test_cli_benchmark_explain_skipped_without_engine_config(
    runner: CliRunner, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
):
    for var in ("SNOWFLAKE_ACCOUNT", "SNOWFLAKE_USER", "SNOWFLAKE_PASSWORD"):
        monkeypatch.delenv(var, raising=False)
    out = tmp_path / "dry.json"
    result = runner.invoke(
        app,
        ["benchmark", "--dry-run", "--explain", "snowflake", *CORPUS_ARGS, "--output", str(out)],
    )
    assert result.exit_code == 0, result.output
    assert "EXPLAIN skipped" in result.output
    data = json.loads(out.read_text())
    assert "SNOWFLAKE_ACCOUNT" in data["explain_skipped"]
    assert data["cost"] is None
    assert all(ev["cost"] is None for ev in data["evaluations"])


def test_cli_benchmark_rejects_unknown_engine(runner: CliRunner):
    result = runner.invoke(app, ["benchmark", "--explain", "postgres", *CORPUS_ARGS])
    assert result.exit_code != 0
