"""Typer CLI for the AI-assisted SQL optimizer."""

from __future__ import annotations

import json
import os
from pathlib import Path

import typer
from rich.console import Console
from rich.markdown import Markdown
from rich.table import Table

from .analyzer import Severity, analyze
from .benchmark import (
    BenchmarkSummary,
    MissingApiKeyError,
    default_client,
    describe_error,
    run_benchmark,
    summary_to_dict,
)
from .client import AnthropicClient
from .explain import ENGINES, EngineUnavailableError, ExplainEngine, engine_from_env

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


def _fmt_bytes(value: float | None) -> str:
    return "-" if value is None else f"{value:,.0f}"


def _print_cost_report(summary: BenchmarkSummary) -> None:
    cost = summary.cost
    table = Table(title=f"EXPLAIN on {cost['engine']}: {cost['metric']}")
    table.add_column("Query")
    table.add_column("Expected")
    table.add_column("Before", justify="right")
    table.add_column("After", justify="right")
    table.add_column("Reduction", justify="right")
    table.add_column("Note")
    for ev in summary.evaluations:
        c = ev.cost
        reduction = c.reduction
        table.add_row(
            ev.query_id,
            ev.expected_cost_direction,
            _fmt_bytes(c.before),
            _fmt_bytes(c.after),
            "-" if reduction is None else f"{reduction:.1%}",
            c.note,
        )
    console.print(table)
    if cost["compared"] == 0:
        console.print(
            "[yellow]EXPLAIN: no query had both a before and an after estimate - "
            "no cost reduction reported.[/yellow]"
        )
        return
    avg = cost["avg_reduction"]
    console.print(
        f"EXPLAIN: {cost['compared']} of {cost['requested']} explained queries compared; "
        f"avg estimated-cost reduction {'n/a' if avg is None else f'{avg:.1%}'}; "
        f"direction matched ground truth on {cost['direction_matches']} of "
        f"{cost['direction_checked']}."
    )


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
        help="--dry-run scores heuristics only (no API calls). --no-dry-run asks Claude "
        "to rewrite every query and scores the rewrite; it needs ANTHROPIC_API_KEY.",
    ),
    limit: int = typer.Option(50, help="Max queries to evaluate"),
    explain: str = typer.Option(
        "",
        "--explain",
        help="Also EXPLAIN the original and rewritten query on an engine: spark (local "
        "SparkSession) or snowflake (SNOWFLAKE_* env). Skipped if not configured.",
    ),
    explain_setup: Path | None = typer.Option(
        None,
        "--explain-setup",
        help="SQL file run once on the EXPLAIN engine first (e.g. CREATE TABLE, USE SCHEMA); "
        "statements are split on ';'.",
    ),
    output: Path | None = typer.Option(
        None, "--output", help="Write full results (rewrites, costs, raw plans) as JSON."
    ),
) -> None:
    """Run the analyzer (and optionally Claude) over the corpus and print a score table."""
    if explain and explain not in ENGINES:
        raise typer.BadParameter(f"--explain must be one of: {', '.join(ENGINES)}")
    if explain_setup is not None and not explain_setup.exists():
        raise typer.BadParameter(f"--explain-setup file not found: {explain_setup}")

    # Check the key before starting an EXPLAIN engine, which can take a while.
    try:
        client = None if dry_run else default_client()
    except MissingApiKeyError as e:
        console.print(f"[red]{e}[/red]")
        raise typer.Exit(code=2) from None

    engine: ExplainEngine | None = None
    explain_skipped: str | None = None
    if explain:
        try:
            engine = engine_from_env(explain, setup_sql=explain_setup)
        except EngineUnavailableError as e:
            explain_skipped = str(e)
            console.print(f"[yellow]EXPLAIN skipped: {e}[/yellow]")
        except Exception as e:  # configured, but failed to start or run --explain-setup
            console.print(
                f"[red]EXPLAIN engine {explain!r} failed to start: {describe_error(e)}[/red]"
            )
            raise typer.Exit(code=2) from None

    try:
        summary = run_benchmark(
            corpus_dir=corpus_dir,
            ground_truth_path=ground_truth,
            dry_run=dry_run,
            limit=limit,
            client=client,
            explain_engine=engine,
        )
    finally:
        if engine is not None:
            engine.close()

    title = f"Benchmark over {summary.evaluated} queries (dry_run={dry_run})"
    if not dry_run:
        title += f" - scored on Claude rewrite + reasoning, model={summary.model}"
    table = Table(title=title)
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

    if summary.cost is not None:
        _print_cost_report(summary)
    elif not explain:
        console.print(
            "[dim]EXPLAIN step not run: no engine (pass --explain spark|snowflake).[/dim]"
        )

    if output is not None:
        data = summary_to_dict(summary)
        data["explain_skipped"] = explain_skipped
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
        console.print(f"[dim]Wrote {output}[/dim]")


if __name__ == "__main__":
    app()
