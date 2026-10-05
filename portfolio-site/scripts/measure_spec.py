"""Label templates that turn raw evaluations into displayed metrics.

``scripts/measure.py render`` calls :func:`render` with the ``evaluations``
block of src/data/measured.json. Every number on the site's metric tiles is
formatted here from a measured value — nothing is typed by hand — so a label
change never requires touching a number, and a re-measure never requires
touching a label.
"""

from __future__ import annotations


def _pr(score: dict) -> str:
    return f"{score['precision']:.2f} / {score['recall']:.2f}"


def _k(n: float) -> str:
    return f"~{round(n / 1000):,}k"


def render(ev: dict) -> tuple[list[dict], dict[str, dict], dict[str, dict]]:
    sq, fr, tl = ev["ai-sql-optimizer"], ev["fraud-signals"], ev["telecom-lakehouse"]
    score = {s["kind"]: s for s in fr["scores"]}
    v5 = next(r for r in fr["sweeps"]["velocity"] if r["threshold"] == 5)
    best = max(fr["sweeps"]["velocity"], key=lambda r: r["f1"])
    rows = tl["rowCounts"]["silver"]
    tests_total = sq["tests"]["passed"] + fr["tests"]["passed"] + tl["tests"]["passed"]
    skipped = sq["tests"]["skipped"] + fr["tests"]["skipped"] + tl["tests"]["skipped"]

    m: dict[str, dict] = {}

    m["telecom.transform"] = {
        "value": f"{tl['transform']['secondsMedian']:.2f}s",
        "label": f"raw → Gold, {rows:,} CDRs",
        "sublabel": f"median of {tl['transform']['runs']} in-process runs · DuckDB",
        "method": "make demo, then scripts/artifacts/telecom.py times raw_to_bronze → bronze_to_silver → silver_to_gold",
        "kind": "measured",
    }
    m["telecom.dbt"] = {
        "value": f"{tl['dbt']['testsPassed']}/{tl['dbt']['tests']}",
        "label": "dbt tests passing",
        "sublabel": f"{tl['dbt']['models']} models · bronze → gold",
        "method": "dbt build (dbt-duckdb, scratch profile) over make demo output",
        "kind": "measured",
    }
    m["telecom.ge"] = {
        "value": str(tl["geExpectations"]),
        "label": "Bronze contract expectations",
        "sublabel": "types · nulls · ranges · MSISDN regex",
        "method": "count of great_expectations/expectations/cdr_bronze_suite.json",
        "kind": "defined",
        "caveat": "Defined in the suite; the transform_silver DAG's checkpoint task is a stub, so the contract is not enforced at runtime yet.",
    }
    m["telecom.tests"] = {
        "value": str(tl["tests"]["passed"]),
        "label": "unit tests passing",
        "sublabel": "generator + transforms",
        "method": "make test",
        "kind": "count",
    }

    m["fraud.throughput"] = {
        "value": f"{_k(fr['throughput']['eventsPerSec'])}/s",
        "label": "events scored by 3 detectors",
        "sublabel": f"{fr['throughput']['events']:,} events · single process · median of {fr['throughput']['runs']}",
        "method": "make eval, then detect_all() timed in-process by scripts/artifacts/fraud.py",
        "kind": "measured",
    }
    m["fraud.geo.pr"] = {
        "value": _pr(score["geo"]),
        "label": "impossible-travel precision / recall",
        "sublabel": "account-level vs seeded ground truth",
        "method": "make eval (anomaly.evaluate)",
        "kind": "measured",
    }
    m["fraud.amount.pr"] = {
        "value": _pr(score["amount"]),
        "label": "amount z-score precision / recall",
        "sublabel": f"{score['amount']['truePositives']} of {score['amount']['trueAccounts']} outlier accounts caught",
        "method": "make eval (anomaly.evaluate)",
        "kind": "measured",
    }
    m["fraud.velocity.pr"] = {
        "value": _pr(score["velocity"]),
        "label": "velocity precision / recall",
        "sublabel": f"{v5['flaggedAccounts']} of {fr['dataset']['accounts']:,} accounts flagged at threshold 5",
        "method": "make eval (anomaly.evaluate)",
        "kind": "measured",
        "caveat": (
            f"A fixed 5-events-in-60s rule fires on ordinary traffic at this simulated rate; "
            f"the sweep peaks at F1 {best['f1']:.2f} with threshold {best['threshold']}."
        ),
    }
    m["fraud.tests"] = {
        "value": str(fr["tests"]["passed"]),
        "label": "unit tests passing",
        "sublabel": f"{fr['tests']['skipped']} Spark-only skip" if fr["tests"]["skipped"] else "producer, detectors, evaluator",
        "method": "make test",
        "kind": "count",
    }

    m["sqlopt.findings"] = {
        "value": f"{sq['summary']['queriesWithFindings']} / {sq['summary']['queries']}",
        "label": "queries with ≥1 analyzer finding",
        "sublabel": "real corpus · heuristics only, no API",
        "method": "make benchmark (dry run)",
        "kind": "measured",
        "caveat": "Any finding counts as a hit; whether the finding is the right one is not scored.",
    }
    m["sqlopt.overlap"] = {
        "value": f"{sq['summary']['meanKeywordOverlap']:.2f}",
        "label": "benchmark keyword overlap (upper bound)",
        "sublabel": f"{sq['summary']['meanKeywordOverlapFindingsOnly']:.2f} when scored on findings alone",
        "method": "make benchmark (dry run); findings-only re-score by scripts/artifacts/sqlopt.py",
        "kind": "measured",
        "caveat": "benchmark._score searches the query text — including its explanatory comments — as well as the findings, which inflates the score.",
    }
    m["sqlopt.latency"] = {
        "value": f"{sq['analyzerLatencyMs']['median']:.1f} ms",
        "label": "analyzer latency per query",
        "sublabel": f"in-process median, warm · n={sq['analyzerLatencyMs']['samples']}",
        "method": "scripts/artifacts/sqlopt.py times analyze() over the 5 corpus queries ×40",
        "kind": "measured",
    }
    m["sqlopt.tests"] = {
        "value": str(sq["tests"]["passed"]),
        "label": "unit tests passing",
        "sublabel": "analyzer, benchmark, CLI, client",
        "method": "make test",
        "kind": "count",
    }

    m["site.tests"] = {
        "value": str(tests_total),
        "label": "unit tests passing",
        "sublabel": f"pytest across 3 projects · {skipped} skipped",
        "method": "make test ×3",
        "kind": "count",
    }

    for key, val in m.items():
        val["id"] = key

    site = [m["telecom.transform"], m["telecom.dbt"], m["fraud.throughput"], m["site.tests"]]
    projects = {
        "fraud-signals": [m["fraud.throughput"], m["fraud.geo.pr"], m["fraud.amount.pr"], m["fraud.velocity.pr"]],
        "telecom-lakehouse": [m["telecom.transform"], m["telecom.dbt"], m["telecom.ge"], m["telecom.tests"]],
        "ai-sql-optimizer": [m["sqlopt.findings"], m["sqlopt.overlap"], m["sqlopt.latency"], m["sqlopt.tests"]],
    }
    return site, {k: {"metrics": v} for k, v in projects.items()}, m


NOT_MEASURED = {
    "ai-sql-optimizer": [
        "Claude rewrite quality — `benchmark --no-dry-run` does not call the API yet",
        "EXPLAIN cost delta — no EXPLAIN runner is implemented",
        "Human acceptance rate of suggestions",
    ],
    "fraud-signals": [
        "Sustained Spark Structured Streaming throughput",
        "End-to-end latency p50 / p95 / p99 (needs the Kafka + Spark stack)",
        "Data loss on restart from checkpoint",
    ],
    "telecom-lakehouse": [
        "Great Expectations enforcement — the checkpoint task is a stub",
        "Airflow end-to-end run timing (needs the docker compose stack)",
        "Iceberg / Athena query performance on AWS",
    ],
}
