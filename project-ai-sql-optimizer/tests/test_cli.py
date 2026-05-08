"""End-to-end tests for the Typer CLI."""

from __future__ import annotations

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


def test_cli_analyze_missing_file_errors(runner: CliRunner, tmp_path: Path):
    result = runner.invoke(app, ["analyze", str(tmp_path / "nope.sql"), "--dry-run"])
    assert result.exit_code != 0
