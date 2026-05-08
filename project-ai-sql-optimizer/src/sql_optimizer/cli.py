"""Typer CLI for the AI-assisted SQL optimizer."""

from __future__ import annotations

import os
from pathlib import Path

import typer
from rich.console import Console
from rich.markdown import Markdown
from rich.table import Table

from .analyzer import Severity, analyze
from .benchmark import run_benchmark
from .client import AnthropicClient

app = typer.Typer(help="AI-assisted SQL optimizer", add_completion=False)
console = Console()


SEVERITY_COLORS = {
    Severity.INFO: "blue",
    Severity.WARN: "yellow",
    Severity.HIGH: "red",
}


def _read_sql(path: Path) -> str:
    if not path.exists():
        raise typer.BadParameter(f"SQL file not found: {path}")
    return path.read_text(encoding="utf-8")


def _detect_dialect(sql: str, override: str | None) -> str:
    if override:
        return override
    upper = sql.upper()
    if "QUALIFY " in upper or "ILIKE " in upper or "FLATTEN(" in upper:
        return "snowflake"
    return "spark"


@app.command(name="analyze")
def analyze_command(
    sql_file: Path = typer.Argument(..., help="Path to a .sql file"),
    dialect: str = typer.Option("", help="Override detected dialect: spark|snowflake|ansi"),
    dry_run: bool = typer.Option(
        False,
        "--dry-run",
        help="Skip the Anthropic call; print heuristic findings only.",
    ),
    partition_columns: str = typer.Option(
        "",
        "--partition-columns",
        help="Comma-separated partition column names for missing-predicate detection.",
    ),
) -> None:
    """Analyze a single SQL file and (unless --dry-run) ask Claude for a rewrite."""
    sql = _read_sql(sql_file)
    used_dialect = _detect_dialect(sql, dialect or None)
    cols = {c.strip() for c in partition_columns.split(",") if c.strip()}

    result = analyze(sql, dialect=used_dialect, partition_columns=cols)

    table = Table(title=f"Analyzer findings ({used_dialect})", show_lines=False)
    table.add_column("Severity")
    table.add_column("Rule")
    table.add_column("Message")
    if not result.findings:
        table.add_row("info", "-", "No heuristic findings.")
    for f in result.findings:
        color = SEVERITY_COLORS.get(f.severity, "white")
        table.add_row(f"[{color}]{f.severity.value}[/{color}]", f.rule, f.message)
    console.print(table)
    console.print(
        f"tables={result.table_count} ctes={result.cte_count} joins={result.join_count}",
        style="dim",
    )

    if dry_run or not os.environ.get("ANTHROPIC_API_KEY"):
        if not dry_run:
            console.print(
                "[yellow]ANTHROPIC_API_KEY not set; running heuristic-only.[/yellow]"
            )
        return

    client = AnthropicClient()
    suggestion = client.suggest(result)
    console.print()
    console.rule("[bold]Suggested rewrite[/bold]")
    if suggestion.rewrite:
        console.print(Markdown(f"```sql\n{suggestion.rewrite}\n```"))
    console.rule("[bold]Reasoning[/bold]")
    console.print(suggestion.reasoning or "(no reasoning returned)")
    console.print(f"[dim]Confidence: {suggestion.confidence}[/dim]")


@app.command(name="benchmark")
def benchmark_command(
    corpus_dir: Path = typer.Option(
        Path("corpus/queries"), help="Directory of .sql files to benchmark"
    ),
    ground_truth: Path = typer.Option(
        Path("corpus/ground_truth.yaml"), help="YAML file of expected suggestions"
    ),
    dry_run: bool = typer.Option(
        True,
        "--dry-run/--no-dry-run",
        help="When true, score with heuristics only (no API calls).",
    ),
    limit: int = typer.Option(50, help="Max queries to evaluate"),
) -> None:
    """Run the analyzer (and optionally Claude) over the corpus and print a score table."""
    summary = run_benchmark(
        corpus_dir=corpus_dir,
        ground_truth_path=ground_truth,
        dry_run=dry_run,
        limit=limit,
    )

    table = Table(title=f"Benchmark over {summary.evaluated} queries (dry_run={dry_run})")
    table.add_column("Category")
    table.add_column("Queries", justify="right")
    table.add_column("Avg keyword overlap", justify="right")
    table.add_column("Findings hit rate", justify="right")
    for cat, stats in summary.by_category.items():
        table.add_row(
            cat,
            str(stats["count"]),
            f"{stats['keyword_overlap']:.2f}",
            f"{stats['findings_hit_rate']:.2f}",
        )
    console.print(table)


if __name__ == "__main__":
    app()
