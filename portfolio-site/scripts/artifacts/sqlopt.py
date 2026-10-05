"""Export the AI-assisted SQL optimizer's real corpus + analyzer output.

Reads project-ai-sql-optimizer's corpus, ground truth, analyzer rules and
prompt, runs the real ``analyze()`` on every query, scores keyword hits with
``benchmark._score`` (analyzer findings only, never the query text), and
checks the hand-written reference rewrites in src/data/sqlopt/rewrites/.

    uv run --project ../project-ai-sql-optimizer python scripts/artifacts/sqlopt.py [--check]

Writes src/data/sqlopt/corpus.json (deterministic). Timing — which varies
run to run — is printed as JSON on stdout for scripts/measure.py instead.
"""

from __future__ import annotations

import ast
import difflib
import json
import statistics
import sys
import time
from importlib.metadata import version
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _common import DATA, digest, project, rel, strip_sql_comments, write_or_check  # noqa: E402

import sqlglot  # noqa: E402
import yaml  # noqa: E402
from sql_optimizer import benchmark  # noqa: E402
from sql_optimizer.analyzer import analyze  # noqa: E402
from sql_optimizer.client import _build_user_message  # noqa: E402
from sql_optimizer.dialect import detect_dialect  # noqa: E402

PROJECT = project("project-ai-sql-optimizer")
CORPUS = PROJECT / "corpus" / "queries"
TRUTH = PROJECT / "corpus" / "ground_truth.yaml"
ANALYZER = PROJECT / "src" / "sql_optimizer" / "analyzer.py"
PROMPT = PROJECT / "src" / "sql_optimizer" / "prompts" / "optimizer_prompt.md"
REWRITES = DATA / "sqlopt" / "rewrites"
OUT = DATA / "sqlopt" / "corpus.json"

# Partition columns used to demonstrate the rule the benchmark never exercises
# (the benchmark passes none, so missing_partition_predicate cannot fire).
PARTITION_DEMO = {"04_partition_pruning": {"ingest_date"}}


def parse_header(text: str) -> tuple[dict[str, str], str, str]:
    """Split the leading ``-- key: value`` header and prose note from the SQL body."""
    meta: dict[str, str] = {}
    note: list[str] = []
    body: list[str] = []
    in_header = True
    for line in text.splitlines():
        stripped = line.strip()
        if in_header and stripped.startswith("--"):
            content = stripped[2:].strip()
            key, sep, value = content.partition(":")
            if sep and key in {"engine", "category"}:
                meta[key] = value.strip()
            else:
                note.append(content)
            continue
        if in_header and not stripped:
            continue
        in_header = False
        body.append(line)
    return meta, " ".join(note).strip(), "\n".join(body).strip() + "\n"


def rule_catalog() -> list[dict]:
    """Every Finding(...) the analyzer can emit, read from its source with ast."""
    tree = ast.parse(ANALYZER.read_text(encoding="utf-8"))
    rules: list[dict] = []
    for node in ast.walk(tree):
        if not (isinstance(node, ast.Call) and getattr(node.func, "id", None) == "Finding"):
            continue
        rule_arg, msg_arg = node.args[0], node.args[1]
        if not isinstance(rule_arg, ast.Constant):
            continue
        if isinstance(msg_arg, ast.Constant):
            message = msg_arg.value
        else:  # f-string: keep the literal parts, mark the holes
            message = "".join(
                v.value if isinstance(v, ast.Constant) else "{n}" for v in msg_arg.values
            )
        severity = "info"
        if len(node.args) > 2 and isinstance(node.args[2], ast.Attribute):
            severity = node.args[2].attr.lower()
        rules.append({"id": rule_arg.value, "severity": severity, "message": message})
    seen: set[str] = set()
    return [r for r in rules if not (r["id"] in seen or seen.add(r["id"]))]


def findings_json(result) -> list[dict]:
    return [
        {"rule": f.rule, "severity": f.severity.value, "message": f.message}
        for f in result.findings
    ]


def line_diff(before: str, after: str) -> list[dict]:
    out: list[dict] = []
    for line in difflib.ndiff(before.splitlines(), after.splitlines()):
        tag, text = line[:2], line[2:]
        if tag == "? ":
            continue
        out.append({"op": {"  ": "eq", "- ": "del", "+ ": "add"}[tag], "text": text})
    return out


def main(check: bool) -> int:
    truth = yaml.safe_load(TRUTH.read_text(encoding="utf-8"))["queries"]
    truth_by_id = {t["query_id"]: t for t in truth}
    catalog = rule_catalog()
    sources = sorted(CORPUS.glob("*.sql"))
    rewrite_files = sorted(REWRITES.glob("*.sql"))

    queries: list[dict] = []
    fired: dict[str, list[str]] = {r["id"]: [] for r in catalog}
    for path in sources:
        qid = path.stem
        text = path.read_text(encoding="utf-8")
        header, note, body = parse_header(text)
        parsed_as = detect_dialect(text)
        result = analyze(text, dialect=parsed_as)
        for f in result.findings:
            fired.setdefault(f.rule, []).append(qid)

        gt = truth_by_id[qid]
        keywords = [k.lower() for k in gt["expected_keywords"]]
        # Same haystack as benchmark._score, so "inFindings" is exactly what it counts;
        # "inQueryText" marks keywords the query itself contains, which the scorer ignores.
        finding_text = "\n".join(f.message for f in result.findings).lower()
        query_text = text.lower()
        hits = [
            {"keyword": k, "inFindings": k in finding_text, "inQueryText": k in query_text}
            for k in keywords
        ]
        overlap, findings_hit = benchmark._score(
            [f.message for f in result.findings], benchmark.GroundTruthEntry(
                query_id=qid, category=gt["category"], expected_keywords=keywords,
                expected_cost_direction=gt["expected_cost_direction"],
            )
        )

        entry: dict = {
            "id": qid,
            "n": int(qid.split("_", 1)[0]),
            "category": gt["category"],
            "engineTag": header.get("engine", "unknown"),
            "parsedAs": parsed_as,
            "note": note,
            "sql": body,
            "stats": {
                "tables": result.table_count,
                "ctes": result.cte_count,
                "joins": result.join_count,
                "lines": len(body.strip().splitlines()),
            },
            "findings": findings_json(result),
            "groundTruth": {
                "keywords": keywords,
                "costDirection": gt["expected_cost_direction"],
            },
            "keywordHits": hits,
            "benchmark": {
                "keywordOverlap": round(overlap, 4),
                "findingsHit": findings_hit,
            },
            "payload": _build_user_message(result),
        }
        if qid in PARTITION_DEMO:
            cols = PARTITION_DEMO[qid]
            with_cols = analyze(text, dialect=parsed_as, partition_columns=cols)
            entry["withPartitionColumns"] = {
                "columns": sorted(cols),
                "findings": findings_json(with_cols),
            }

        rw_path = REWRITES / path.name
        if rw_path.exists():
            rw_sql = rw_path.read_text(encoding="utf-8")
            try:
                sqlglot.parse_one(rw_sql, read=parsed_as)
                parses = True
            except sqlglot.errors.ParseError:
                parses = False
            after = analyze(rw_sql, dialect=parsed_as)
            rw_text = strip_sql_comments(rw_sql).lower()
            entry["rewrite"] = {
                "sql": rw_sql,
                "dialect": parsed_as,
                "parses": parses,
                "findingsAfter": findings_json(after),
                "keywordsMatched": [k for k in keywords if k in rw_text],
                "diff": line_diff(body, rw_sql),
                "source": rel(rw_path),
            }
        queries.append(entry)

    n = len(queries)
    summary = {
        "queries": n,
        "meanKeywordOverlap": round(sum(q["benchmark"]["keywordOverlap"] for q in queries) / n, 4),
        "queriesWithFindings": sum(1 for q in queries if q["findings"]),
        "rulesFired": sorted(r for r, qs in fired.items() if qs),
        "rulesNeverFired": sorted(r for r, qs in fired.items() if not qs),
    }
    for rule in catalog:
        rule["firesOn"] = sorted(set(fired.get(rule["id"], [])))

    doc = {
        "_meta": {
            "synthetic": False,
            "generatedBy": "portfolio-site/scripts/artifacts/sqlopt.py",
            "source": rel(PROJECT),
            "sourceDigest": digest([*sources, TRUTH, ANALYZER, PROMPT, *rewrite_files]),
            "sqlglot": version("sqlglot"),
            "note": (
                "Real corpus queries and real analyze() output. Keyword overlap comes from "
                "benchmark._score, which searches the analyzer findings only, never the query "
                "text; inQueryText marks keywords the query already contains. Rewrites are "
                "hand-written references, not Claude output, and are not EXPLAIN-verified."
            ),
        },
        "summary": summary,
        "rules": catalog,
        "prompt": PROMPT.read_text(encoding="utf-8"),
        "queries": queries,
    }
    ok = write_or_check(OUT, doc, check)

    # Timing (non-deterministic) goes to stdout for measure.py, never into the fixture.
    texts = [p.read_text(encoding="utf-8") for p in sources]
    dialects = [detect_dialect(t) for t in texts]
    samples: list[float] = []
    for _ in range(40):
        for t, d in zip(texts, dialects, strict=True):
            t0 = time.perf_counter()
            analyze(t, dialect=d)
            samples.append((time.perf_counter() - t0) * 1000)
    print(json.dumps({
        "summary": summary,
        "byCategory": [
            {
                "category": q["category"],
                "keywordOverlap": q["benchmark"]["keywordOverlap"],
                "findingsHitRate": 1.0 if q["benchmark"]["findingsHit"] else 0.0,
            }
            for q in queries
        ],
        "analyzerLatencyMs": {
            "median": round(statistics.median(samples), 2),
            "p95": round(sorted(samples)[int(len(samples) * 0.95) - 1], 2),
            "samples": len(samples),
        },
    }))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main(check="--check" in sys.argv))
