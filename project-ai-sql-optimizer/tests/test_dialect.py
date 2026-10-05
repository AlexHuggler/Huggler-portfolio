"""Tests for shared dialect detection."""

from __future__ import annotations

import re
from pathlib import Path

import pytest

from sql_optimizer.dialect import detect_dialect, engine_tag

REPO = Path(__file__).resolve().parent.parent

PLAIN_SQL = "SELECT id FROM events WHERE region = 'US'"
QUALIFY_SQL = "SELECT id FROM events QUALIFY ROW_NUMBER() OVER (ORDER BY id) = 1"


def test_engine_tag_reads_header():
    assert engine_tag(f"-- Engine: Snowflake\n{PLAIN_SQL}") == "snowflake"


def test_engine_tag_is_none_without_header():
    assert engine_tag(QUALIFY_SQL) is None


def test_engine_header_overrides_heuristic():
    assert detect_dialect(f"-- engine: snowflake\n{PLAIN_SQL}") == "snowflake"


def test_engine_header_beats_snowflake_keywords():
    assert detect_dialect(f"-- engine: spark\n{QUALIFY_SQL}") == "spark"


def test_engine_header_is_case_insensitive():
    assert detect_dialect(f"-- ENGINE: Snowflake\n{PLAIN_SQL}") == "snowflake"


def test_engine_header_found_below_other_comments():
    sql = f"-- category: join_optimization\n-- engine: snowflake\n{PLAIN_SQL}"
    assert detect_dialect(sql) == "snowflake"


def test_engine_header_past_scan_window_is_ignored():
    sql = "\n".join(["-- note"] * 5 + ["-- engine: snowflake", PLAIN_SQL])
    assert detect_dialect(sql) == "spark"


def test_engine_header_must_be_on_one_comment_line():
    assert detect_dialect(f"--\nengine: snowflake\n{PLAIN_SQL}") == "spark"


def test_override_beats_engine_header():
    assert detect_dialect(f"-- engine: snowflake\n{PLAIN_SQL}", override="spark") == "spark"


def test_override_beats_heuristic():
    assert detect_dialect(QUALIFY_SQL, override="spark") == "spark"


@pytest.mark.parametrize(
    ("sql", "expected"),
    [
        (QUALIFY_SQL, "snowflake"),
        ("SELECT id FROM users WHERE name ILIKE 'a%'", "snowflake"),
        ("SELECT f.value FROM t, LATERAL FLATTEN(input => t.arr) f", "snowflake"),
        (PLAIN_SQL, "spark"),
    ],
)
def test_keyword_fallback_without_header(sql: str, expected: str):
    assert detect_dialect(sql) == expected


def test_corpus_queries_resolve_to_their_engine_header():
    for path in sorted((REPO / "corpus" / "queries").glob("*.sql")):
        sql = path.read_text(encoding="utf-8")
        tagged = re.search(r"--\s*engine:\s*(\w+)", sql)
        assert tagged, f"{path.name} has no engine header"
        assert detect_dialect(sql) == tagged.group(1), path.name
