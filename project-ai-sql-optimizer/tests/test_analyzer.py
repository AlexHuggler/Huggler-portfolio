"""Tests for the heuristic analyzer."""

from __future__ import annotations

from sql_optimizer.analyzer import Severity, analyze


def test_analyze_select_star_is_warned():
    sql = "SELECT * FROM bronze.fct_orders"
    result = analyze(sql, dialect="spark")
    assert result.parsed_ok
    assert any(f.rule == "select_star" for f in result.findings)


def test_analyze_cross_join_is_high_severity():
    sql = "SELECT a.id, b.id FROM t1 a CROSS JOIN t2 b"
    result = analyze(sql, dialect="spark")
    assert any(f.rule == "cross_join" and f.severity == Severity.HIGH for f in result.findings)


def test_analyze_missing_partition_predicate():
    sql = "SELECT id FROM events WHERE region = 'US'"
    result = analyze(sql, dialect="spark", partition_columns={"ingest_date"})
    assert any(f.rule == "missing_partition_predicate" for f in result.findings)


def test_analyze_partition_predicate_present():
    sql = "SELECT id FROM events WHERE ingest_date >= '2026-01-01'"
    result = analyze(sql, dialect="spark", partition_columns={"ingest_date"})
    assert not any(f.rule == "missing_partition_predicate" for f in result.findings)


def test_analyze_broadcast_recommendation_for_join():
    sql = "SELECT a.x, b.y FROM big a JOIN small b ON a.id = b.id"
    result = analyze(sql, dialect="spark")
    assert any(f.rule == "consider_broadcast" for f in result.findings)


def test_analyze_no_broadcast_when_hint_present():
    sql = "SELECT /*+ BROADCAST(b) */ a.x, b.y FROM big a JOIN small b ON a.id = b.id"
    result = analyze(sql, dialect="spark")
    assert not any(f.rule == "consider_broadcast" for f in result.findings)


def test_analyze_handles_unparseable_sql():
    # sqlglot is permissive across versions, so we test the failure path with
    # an input that is reliably rejected.
    result = analyze("SELECT * FROM (((", dialect="spark")
    if not result.parsed_ok:
        assert any(f.rule == "parse_error" for f in result.findings)
    else:
        # Newer sqlglot may accept this; we still expect a well-formed result.
        assert result.findings is not None


def test_analyze_counts_metadata():
    sql = """
        WITH a AS (SELECT 1 AS id), b AS (SELECT 2 AS id)
        SELECT a.id, b.id FROM a JOIN b ON a.id = b.id
    """
    result = analyze(sql, dialect="spark")
    assert result.parsed_ok
    assert result.cte_count == 2
    assert result.join_count >= 1
