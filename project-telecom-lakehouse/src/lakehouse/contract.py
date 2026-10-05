"""Bronze data contract: run the Great Expectations checkpoint over Bronze CDRs.

``validate_bronze`` is what the ``transform_silver`` DAG runs before
``bronze_to_silver``. Any failed expectation raises ``DataContractError``, which
fails the Airflow task and blocks Silver (and, because Gold is scheduled on the
Silver Dataset, Gold too).

Enforcement is the default. A missing ``great_expectations`` install is an
error, not a skip; the only way to bypass the contract is to set
``LAKEHOUSE_ENFORCE_CONTRACT=false``, which logs a warning on every run.
"""

from __future__ import annotations

import logging
import os
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import pandas as pd
import typer
from rich.console import Console

from lakehouse.transform import BRONZE_DIR

app = typer.Typer(help="Bronze data contract (Great Expectations checkpoint)")
console = Console()
log = logging.getLogger(__name__)


GE_ROOT = Path("great_expectations")
CHECKPOINT_NAME = "cdr_bronze_checkpoint"
ENFORCE_ENV_VAR = "LAKEHOUSE_ENFORCE_CONTRACT"
_OPT_OUT_VALUES = {"0", "false", "no", "off"}


class DataContractError(RuntimeError):
    """Bronze data failed one or more expectations in the contract suite."""


@dataclass(frozen=True)
class ContractResult:
    rows: int
    expectations: int


def contract_enforced() -> bool:
    """True unless ``LAKEHOUSE_ENFORCE_CONTRACT`` explicitly opts out."""
    value = os.environ.get(ENFORCE_ENV_VAR, "true").strip().lower()
    return value not in _OPT_OUT_VALUES


def validate_bronze(
    bronze: Path = BRONZE_DIR,
    ge_root: Path = GE_ROOT,
    *,
    enforce: bool | None = None,
) -> ContractResult | None:
    """Validate ``bronze/cdr.parquet`` with the ``cdr_bronze_checkpoint``.

    Returns the row and expectation counts when every expectation passes, or
    ``None`` when enforcement is switched off. Raises ``DataContractError`` when
    any expectation fails.
    """
    if enforce is None:
        enforce = contract_enforced()
    if not enforce:
        log.warning("%s is off: the Bronze data contract was NOT checked.", ENFORCE_ENV_VAR)
        return None

    try:
        import great_expectations as gx  # type: ignore[import-untyped]
    except ImportError:
        gx = None
    # Without the library installed, the GE project folder itself (on sys.path in
    # the repo and in the Airflow image) imports as an empty namespace package.
    if not hasattr(gx, "get_context"):
        raise RuntimeError(
            "great_expectations is not installed, so the Bronze data contract cannot run. "
            f"Install the `quality` extra, or set {ENFORCE_ENV_VAR}=false to skip it explicitly."
        )

    df = pd.read_parquet(bronze / "cdr.parquet")
    _ensure_uncommitted_dirs(ge_root)
    context = gx.get_context(context_root_dir=str(ge_root))
    result = context.run_checkpoint(
        checkpoint_name=CHECKPOINT_NAME,
        batch_request={
            "runtime_parameters": {"batch_data": df},
            "batch_identifiers": {"default_identifier_name": "bronze_cdr"},
        },
    )
    validations = result.list_validation_results()
    evaluated = sum(len(v.results) for v in validations)
    if not result.success:
        failures = [_describe(r) for v in validations for r in v.results if not r.success]
        raise DataContractError(
            f"Bronze data contract failed {len(failures)} of {evaluated} expectations: "
            + "; ".join(failures or ["checkpoint reported failure"])
        )

    log.info("Bronze data contract passed: %d expectations over %d rows", evaluated, len(df))
    return ContractResult(rows=len(df), expectations=evaluated)


def _ensure_uncommitted_dirs(ge_root: Path) -> None:
    """Create the git-ignored ``uncommitted/`` paths GE 0.18 checks for.

    If any is missing, ``get_context`` treats the project as unscaffolded and
    writes a fresh ``gx/`` project next to ``ge_root`` on every run.
    """
    uncommitted = ge_root / "uncommitted"
    for name in ("data_docs", "validations"):
        (uncommitted / name).mkdir(parents=True, exist_ok=True)
    config_variables = uncommitted / "config_variables.yml"
    if not config_variables.exists():
        config_variables.write_text("{}\n")


def _describe(validation_result: Any) -> str:
    config = validation_result.expectation_config
    name = config.expectation_type
    column = config.kwargs.get("column")
    if column:
        name = f"{name}({column})"
    exception_info = validation_result.exception_info or {}
    if exception_info.get("raised_exception"):
        return f"{name} raised {exception_info.get('exception_message')}"
    details = validation_result.result or {}
    if "unexpected_count" in details:
        return f"{name}: {details['unexpected_count']} unexpected value(s)"
    return f"{name}: observed {details.get('observed_value')!r}"


@app.command()
def main(
    bronze: Path = typer.Option(BRONZE_DIR, help="Directory holding Bronze cdr.parquet"),
    ge_root: Path = typer.Option(GE_ROOT, help="Great Expectations project directory"),
) -> None:
    """Run the Bronze data contract; exit non-zero if any expectation fails."""
    started = time.perf_counter()
    try:
        result = validate_bronze(bronze, ge_root)
    except DataContractError as exc:
        console.print(f"[red]FAIL[/red] {exc}")
        raise typer.Exit(code=1) from exc
    elapsed = time.perf_counter() - started
    if result is None:
        console.print(f"[yellow]SKIPPED[/yellow] {ENFORCE_ENV_VAR} is off")
        return
    console.print(
        f"[green]PASS[/green] {result.expectations} of {result.expectations} expectations "
        f"over {result.rows:,} Bronze rows in {elapsed:.2f} s"
    )


if __name__ == "__main__":
    app()
