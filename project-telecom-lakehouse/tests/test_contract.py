"""Tests for the Bronze data contract (``lakehouse.contract``).

The first group scripts the GE checkpoint result with the ``fake_gx`` fixture and
always runs. The second group runs the real ``cdr_bronze_checkpoint`` and needs
the ``quality`` extra.
"""

from __future__ import annotations

import shutil
import sys
import types
from datetime import UTC, datetime
from pathlib import Path

import pytest
from data_generator.generate_cdrs import make_rows

from lakehouse.contract import (
    ENFORCE_ENV_VAR,
    ContractResult,
    DataContractError,
    contract_enforced,
    validate_bronze,
)

GE_DIR = Path(__file__).resolve().parents[1] / "great_expectations"


@pytest.fixture(autouse=True)
def _enforcing_by_default(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.delenv(ENFORCE_ENV_VAR, raising=False)


def test_enforcement_is_on_unless_explicitly_disabled(monkeypatch: pytest.MonkeyPatch):
    assert contract_enforced()
    for value in ("true", "1", "yes", ""):
        monkeypatch.setenv(ENFORCE_ENV_VAR, value)
        assert contract_enforced(), value
    for value in ("false", "0", "no", "off", " False "):
        monkeypatch.setenv(ENFORCE_ENV_VAR, value)
        assert not contract_enforced(), value


@pytest.mark.parametrize(
    "stand_in",
    [None, types.ModuleType("great_expectations")],
    # None makes the import fail; an empty module is what the repo's own
    # great_expectations/ folder imports as when the library is absent.
    ids=["import-fails", "shadowed-by-project-folder"],
)
def test_missing_great_expectations_fails_loudly(
    write_bronze, monkeypatch: pytest.MonkeyPatch, stand_in
):
    bronze = write_bronze()
    monkeypatch.setitem(sys.modules, "great_expectations", stand_in)
    with pytest.raises(RuntimeError, match="great_expectations is not installed"):
        validate_bronze(bronze, GE_DIR)


def test_explicit_opt_out_skips_without_importing_ge(
    write_bronze, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
):
    bronze = write_bronze()
    monkeypatch.setitem(sys.modules, "great_expectations", None)
    monkeypatch.setenv(ENFORCE_ENV_VAR, "false")
    assert validate_bronze(bronze, GE_DIR) is None
    assert "NOT checked" in caplog.text


def test_failing_expectation_raises_and_names_it(write_bronze, fake_gx):
    bronze = write_bronze()
    fake_gx(
        failures=[
            ("expect_column_values_to_match_regex", "caller_msisdn", 4),
            ("expect_column_values_to_be_unique", "cdr_id", 2),
        ]
    )
    with pytest.raises(DataContractError) as excinfo:
        validate_bronze(bronze, GE_DIR)
    message = str(excinfo.value)
    assert "failed 2 of 10 expectations" in message
    assert "expect_column_values_to_match_regex(caller_msisdn): 4 unexpected" in message
    assert "expect_column_values_to_be_unique(cdr_id): 2 unexpected" in message


def test_passing_checkpoint_returns_counts_and_sends_bronze(write_bronze, fake_gx):
    bronze = write_bronze()
    calls = fake_gx()
    assert validate_bronze(bronze, GE_DIR) == ContractResult(rows=300, expectations=10)
    (call,) = calls
    assert call["checkpoint_name"] == "cdr_bronze_checkpoint"
    assert len(call["batch_request"]["runtime_parameters"]["batch_data"]) == 300


# --- real Great Expectations checkpoint -------------------------------------------


@pytest.fixture
def ge_root(tmp_path: Path) -> Path:
    """A copy of the GE project, so validation results never land in the repo."""
    # A submodule, because the repo's great_expectations/ folder makes the bare
    # package importable even when the library isn't installed.
    pytest.importorskip("great_expectations.data_context")
    root = tmp_path / "great_expectations"
    shutil.copytree(GE_DIR, root, ignore=shutil.ignore_patterns("uncommitted"))
    return root


def test_real_checkpoint_passes_clean_bronze(write_bronze, ge_root: Path):
    result = validate_bronze(write_bronze(), ge_root)
    assert result == ContractResult(rows=300, expectations=10)


@pytest.mark.parametrize(
    ("override", "expected"),
    [
        ({"market": "MARS"}, r"expect_column_values_to_be_in_set\(market\): 1 unexpected"),
        ({"caller_msisdn": "555-0100"}, r"expect_column_values_to_match_regex\(caller_msisdn\)"),
        ({"duration_sec": 90_000}, r"expect_column_values_to_be_between\(duration_sec\)"),
    ],
    ids=["unknown-market", "malformed-msisdn", "duration-out-of-range"],
)
def test_real_checkpoint_rejects_contract_violation(
    write_bronze, ge_root: Path, override: dict, expected: str
):
    rows = make_rows(300, seed=7, start=datetime(2026, 1, 1, tzinfo=UTC))
    rows.append({**rows[0], "cdr_id": "contract-breaker", **override})
    with pytest.raises(DataContractError, match=expected):
        validate_bronze(write_bronze(rows), ge_root)
