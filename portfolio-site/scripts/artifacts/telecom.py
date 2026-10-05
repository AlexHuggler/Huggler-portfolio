"""Export telecom-lakehouse artifacts: real DAGs, dbt graph, contracts, samples.

Reads project-telecom-lakehouse's Airflow DAG files (via ``ast`` — Airflow is
not required), the dbt project (model SQL + schema.yml tests), the Great
Expectations suite, and — after ``make demo`` — the Bronze/Silver/Gold parquet
outputs through DuckDB. Writes:

* src/data/lakehouse/dags.json       — 3 DAGs: schedule, default_args, tasks, edges
* src/data/lakehouse/dbt.json        — 8 models + 1 source: refs, materialization, tests, SQL
* src/data/lakehouse/contracts.json  — GE expectations as readable rules
* src/data/lakehouse/samples.json    — schemas, masked sample rows, row counts, gold marts

    uv run --project ../project-telecom-lakehouse python scripts/artifacts/telecom.py [--check]

make demo stamps rows with seeded uuid4 ids and dates relative to "today", so
ids are redacted, MSISDNs masked and dates expressed as partition offsets.
Transform timing is printed on stdout for scripts/measure.py.
"""

from __future__ import annotations

import ast
import json
import re
import statistics
import sys
import tempfile
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _common import DATA, digest, project, rel, write_or_check  # noqa: E402

import duckdb  # noqa: E402
import yaml  # noqa: E402

PROJECT = project("project-telecom-lakehouse")
DAGS = PROJECT / "dags"
DBT = PROJECT / "dbt_telecom"
GE_SUITE = PROJECT / "great_expectations" / "expectations" / "cdr_bronze_suite.json"
DATA_DIR = PROJECT / "data"
OUT = DATA / "lakehouse"

LAYER_OF = {"bronze": "bronze", "silver": "silver", "gold": "gold"}


# --------------------------------------------------------------------------- #
# Airflow DAGs (static analysis)
# --------------------------------------------------------------------------- #

def _literal(node: ast.AST):
    if isinstance(node, ast.Dict):
        return {ast.literal_eval(k): _literal(v) for k, v in zip(node.keys, node.values, strict=True)}
    try:
        return ast.literal_eval(node)
    except ValueError:
        if isinstance(node, ast.Call) and getattr(node.func, "id", "") == "timedelta":
            kw = {k.arg: ast.literal_eval(k.value) for k in node.keywords}
            return {"timedelta": kw}
        if isinstance(node, ast.Call) and getattr(node.func, "id", "") == "datetime":
            return "-".join(f"{ast.literal_eval(a):02d}" for a in node.args)
        if isinstance(node, ast.JoinedStr):
            return "".join(
                v.value if isinstance(v, ast.Constant) else "{" + ast.unparse(v.value) + "}"
                for v in node.values
            )
        return ast.unparse(node)


def parse_dag(path: Path) -> dict | None:
    tree = ast.parse(path.read_text(encoding="utf-8"))
    module_doc = ast.get_docstring(tree) or ""
    consts: dict[str, object] = {}
    functions: dict[str, str] = {}
    for node in tree.body:
        if isinstance(node, ast.Assign) and len(node.targets) == 1:
            name = getattr(node.targets[0], "id", None)
            if name and name.isupper():
                consts[name] = _literal(node.value)
        if isinstance(node, ast.FunctionDef):
            functions[node.name] = ast.get_docstring(node) or ""

    dag: dict | None = None
    tasks: dict[str, dict] = {}
    var_to_task: dict[str, str] = {}
    edges: list[list[str]] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.With):
            call = node.items[0].context_expr
            if isinstance(call, ast.Call) and getattr(call.func, "id", "") == "DAG":
                kw = {k.arg: k.value for k in call.keywords}
                dag = {
                    "id": ast.literal_eval(kw["dag_id"]),
                    "description": ast.literal_eval(kw["description"]),
                    "schedule": ast.literal_eval(kw["schedule"]),
                    "startDate": _literal(kw["start_date"]),
                    "catchup": ast.literal_eval(kw["catchup"]),
                    "tags": ast.literal_eval(kw["tags"]),
                }
        if isinstance(node, ast.Assign) and isinstance(node.value, ast.Call):
            op = getattr(node.value.func, "id", "")
            if op.endswith("Operator"):
                kw = {k.arg: k.value for k in node.value.keywords}
                task_id = ast.literal_eval(kw["task_id"])
                var_to_task[node.targets[0].id] = task_id
                task = {"id": task_id, "operator": op}
                if "python_callable" in kw:
                    fn = ast.unparse(kw["python_callable"])
                    task["callable"] = fn
                    task["doc"] = functions.get(fn, "")
                if "bash_command" in kw:
                    cmd = _literal(kw["bash_command"])
                    for name, value in consts.items():
                        cmd = cmd.replace("{" + name + "}", str(value))
                    task["command"] = cmd
                tasks[task_id] = task
        if isinstance(node, ast.BinOp) and isinstance(node.op, ast.RShift):
            left, right = ast.unparse(node.left), ast.unparse(node.right)
            edges.append([left, right])
    if dag is None:
        return None
    dag["doc"] = module_doc.splitlines()[0] if module_doc else ""
    dag["defaultArgs"] = consts.get("DEFAULT_ARGS", {})
    dag["tasks"] = list(tasks.values())
    dag["edges"] = [[var_to_task.get(a, a), var_to_task.get(b, b)] for a, b in edges]
    dag["file"] = rel(path)
    return dag


# --------------------------------------------------------------------------- #
# dbt project (static analysis)
# --------------------------------------------------------------------------- #

REF = re.compile(r"\{\{\s*ref\(\s*'([^']+)'\s*\)\s*\}\}")
SOURCE = re.compile(r"\{\{\s*source\(\s*'([^']+)'\s*,\s*'([^']+)'\s*\)\s*\}\}")
CONFIG = re.compile(r"\{\{\s*config\(\s*materialized\s*=\s*'([^']+)'\s*\)\s*\}\}")


def describe_test(test) -> dict:
    if isinstance(test, str):
        return {"type": test}
    (name, args), = test.items()
    out = {"type": name}
    if name == "accepted_values":
        out["detail"] = ", ".join(args["values"])
    elif name == "relationships":
        out["detail"] = f"{args['to'].replace('ref(', '').strip(')').strip(chr(39))}.{args['field']}"
        out["to"] = args["to"].split("'")[1]
    elif name == "expression_is_true":
        out["detail"] = args["expression"]
    return out


def parse_dbt() -> dict:
    project_cfg = yaml.safe_load((DBT / "dbt_project.yml").read_text(encoding="utf-8"))
    folder_defaults = {
        k: v.get("+materialized")
        for k, v in project_cfg["models"]["dbt_telecom"].items()
    }
    tests_by_model: dict[str, list[dict]] = {}
    descriptions: dict[str, str] = {}
    source_tests: list[dict] = []
    source_meta: dict = {}
    for schema in sorted((DBT / "models").rglob("*.yml")):
        doc = yaml.safe_load(schema.read_text(encoding="utf-8"))
        for m in doc.get("models", []):
            descriptions[m["name"]] = m.get("description", "")
            for col in m.get("columns", []):
                for t in col.get("tests", []):
                    tests_by_model.setdefault(m["name"], []).append(
                        {"column": col["name"], **describe_test(t)}
                    )
        for src in doc.get("sources", []):
            for table in src["tables"]:
                source_meta = {
                    "id": f"{src['name']}.{table['name']}",
                    "description": table.get("description", ""),
                    "location": table.get("meta", {}).get("external_location", ""),
                }
                for col in table.get("columns", []):
                    for t in col.get("tests", []):
                        source_tests.append({"column": col["name"], **describe_test(t)})

    models = []
    for sql_path in sorted((DBT / "models").rglob("*.sql")):
        sql = sql_path.read_text(encoding="utf-8")
        layer = sql_path.parent.name
        cfg = CONFIG.search(sql)
        name = sql_path.stem
        models.append({
            "id": name,
            "layer": layer,
            "materialized": cfg.group(1) if cfg else folder_defaults.get(layer),
            "description": descriptions.get(name, ""),
            "refs": sorted(set(REF.findall(sql))),
            "sources": sorted({f"{a}.{b}" for a, b in SOURCE.findall(sql)}),
            "tests": tests_by_model.get(name, []),
            "sql": sql.strip() + "\n",
            "file": rel(sql_path),
        })
    order = {"bronze": 0, "silver": 1, "gold": 2}
    models.sort(key=lambda m: (order[m["layer"]], m["id"]))
    total_tests = sum(len(m["tests"]) for m in models) + len(source_tests)
    return {
        "_meta": {
            "synthetic": False,
            "generatedBy": "portfolio-site/scripts/artifacts/telecom.py",
            "source": rel(DBT),
            "note": "Parsed from the dbt project's model SQL and schema.yml files.",
        },
        "source": {**source_meta, "tests": source_tests},
        "models": models,
        "testCount": total_tests,
        "testTypes": sorted({t["type"] for m in models for t in m["tests"]}
                            | {t["type"] for t in source_tests}),
    }


# --------------------------------------------------------------------------- #
# Great Expectations suite
# --------------------------------------------------------------------------- #

def readable(exp: dict) -> str:
    t, kw = exp["expectation_type"], exp["kwargs"]
    col = kw.get("column")
    if t == "expect_table_columns_to_match_set":
        return f"Table has exactly these {len(kw['column_set'])} columns"
    if t == "expect_column_values_to_not_be_null":
        return f"{col} is never null"
    if t == "expect_column_values_to_be_unique":
        return f"{col} is unique"
    if t == "expect_column_values_to_match_regex":
        return f"{col} matches {kw['regex']}"
    if t == "expect_column_values_to_be_in_set":
        return f"{col} ∈ {{{', '.join(kw['value_set'])}}}"
    if t == "expect_column_values_to_be_between":
        return f"{kw['min_value']:,} ≤ {col} ≤ {kw['max_value']:,}"
    return t


def parse_contracts() -> dict:
    suite = json.loads(GE_SUITE.read_text(encoding="utf-8"))
    return {
        "_meta": {
            "synthetic": False,
            "generatedBy": "portfolio-site/scripts/artifacts/telecom.py",
            "source": rel(GE_SUITE),
            "note": (
                "Expectations are defined in the suite. The transform_silver DAG loads the GE "
                "context but does not run a checkpoint, so enforcement is stubbed."
            ),
        },
        "suite": suite["expectation_suite_name"],
        "description": suite["meta"].get("description", ""),
        "expectations": [
            {
                "type": e["expectation_type"],
                "column": e["kwargs"].get("column"),
                "rule": readable(e),
                "kwargs": e["kwargs"],
            }
            for e in suite["expectations"]
        ],
    }


# --------------------------------------------------------------------------- #
# Demo outputs (DuckDB over make demo's parquet)
# --------------------------------------------------------------------------- #

def mask_msisdn(v: str | None) -> str | None:
    return None if v is None else v[:2] + "•" * 6 + v[-4:]


def samples() -> dict:
    con = duckdb.connect(":memory:")
    tables = {
        "bronze": DATA_DIR / "bronze" / "cdr.parquet",
        "silver": DATA_DIR / "silver" / "cdr.parquet",
        "gold.revenue_by_market": DATA_DIR / "gold" / "revenue_by_market.parquet",
        "gold.arpu_monthly": DATA_DIR / "gold" / "arpu_monthly.parquet",
        "gold.churn_signals": DATA_DIR / "gold" / "churn_signals.parquet",
    }
    dates = [r[0] for r in con.execute(
        f"SELECT DISTINCT ingest_date FROM '{tables['silver']}' ORDER BY 1").fetchall()]
    day_of = {d: f"D{idx + 1}" for idx, d in enumerate(dates)}

    def clean(row: dict) -> dict:
        out = {}
        for k, v in row.items():
            if k in {"caller_msisdn", "callee_msisdn"}:
                v = mask_msisdn(v)
            elif k == "cdr_id":
                v = "uuid4…"
            elif k in {"ingest_date", "last_active_date"}:
                v = day_of.get(v, str(v))
            elif k in {"start_time", "last_event"}:
                v = f"{day_of.get(v.date(), '?')} {v:%H:%M:%S}"
            elif k == "month":
                v = "M1"
            elif isinstance(v, float):
                v = round(v, 4)
            elif hasattr(v, "is_finite"):  # Decimal from DuckDB
                v = float(v)
            out[k] = v
        return out

    layers = {}
    for name, path in tables.items():
        schema = [{"column": c, "type": t} for c, t, *_ in
                  con.execute(f"DESCRIBE SELECT * FROM '{path}'").fetchall()]
        order = {
            "bronze": "caller_msisdn, start_time", "silver": "caller_msisdn, start_time",
            "gold.revenue_by_market": "market, ingest_date",
            "gold.arpu_monthly": "plan_id",
            "gold.churn_signals": "caller_msisdn",
        }[name]
        cur = con.execute(f"SELECT * FROM '{path}' ORDER BY {order} LIMIT 4")
        cols = [d[0] for d in cur.description]
        rows = [dict(zip(cols, r, strict=True)) for r in cur.fetchall()]
        layers[name] = {
            "rows": con.execute(f"SELECT COUNT(*) FROM '{path}'").fetchone()[0],
            "schema": schema,
            "sample": [clean(r) for r in rows],
        }

    revenue = [
        {"market": m, "day": day_of[d], "revenueUsd": round(r, 2), "events": n}
        for m, d, r, n in con.execute(
            f"SELECT market, ingest_date, revenue_usd, event_count "
            f"FROM '{tables['gold.revenue_by_market']}' ORDER BY market, ingest_date"
        ).fetchall()
    ]
    arpu = [
        {"plan": p, "arpuUsd": round(a, 4), "activeCallers": n}
        for p, a, n in con.execute(
            f"SELECT plan_id, arpu_usd, active_callers "
            f"FROM '{tables['gold.arpu_monthly']}' ORDER BY plan_id"
        ).fetchall()
    ]
    churn = dict(con.execute(
        f"SELECT churn_risk, COUNT(*) FROM '{tables['gold.churn_signals']}' "
        f"GROUP BY 1 ORDER BY 1").fetchall())
    distinct_callers = con.execute(
        f"SELECT COUNT(DISTINCT caller_msisdn) FROM '{tables['silver']}'").fetchone()[0]
    call_mix = dict(con.execute(
        f"SELECT call_type, COUNT(*) FROM '{tables['silver']}' GROUP BY 1 ORDER BY 1").fetchall())
    return {
        "_meta": {
            "synthetic": True,
            "generatedBy": "portfolio-site/scripts/artifacts/telecom.py",
            "source": rel(DATA_DIR) + " (make demo, seed 42)",
            "note": (
                "Real make demo output read with DuckDB. Callers and callees come from a seeded "
                "subscriber pool; MSISDNs are masked, cdr_id (a seeded uuid4) is redacted, and dates "
                "are shown as partition offsets (D1..D3) because make demo stamps rows relative to "
                "the run date."
            ),
        },
        "partitions": len(dates),
        "layers": layers,
        "gold": {"revenueByMarket": revenue, "arpuMonthly": arpu, "churnRisk": churn},
        "distinctCallers": distinct_callers,
        "callMix": call_mix,
    }


def time_transform() -> dict:
    sys.path.insert(0, str(PROJECT / "src"))
    from lakehouse.transform import bronze_to_silver, raw_to_bronze, silver_to_gold

    runs = []
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        for _ in range(5):
            t0 = time.perf_counter()
            raw_to_bronze(DATA_DIR / "raw", tmp_path / "bronze")
            bronze_to_silver(tmp_path / "bronze", tmp_path / "silver")
            silver_to_gold(tmp_path / "silver", tmp_path / "gold")
            runs.append(time.perf_counter() - t0)
    return {"secondsMedian": round(statistics.median(runs), 3), "runs": len(runs)}


def main(check: bool) -> int:
    dag_files = sorted(p for p in DAGS.glob("*.py") if p.name != "__init__.py")
    dags = [d for d in (parse_dag(p) for p in dag_files) if d]
    dbt = parse_dbt()
    contracts = parse_contracts()
    demo = samples()
    dag_doc = {
        "_meta": {
            "synthetic": False,
            "generatedBy": "portfolio-site/scripts/artifacts/telecom.py",
            "source": rel(DAGS),
            "sourceDigest": digest(dag_files),
            "note": (
                "Parsed statically from the DAG files. The three DAGs run on independent "
                "schedules; there are no cross-DAG sensors or Datasets linking them."
            ),
        },
        "dags": dags,
    }
    ok = all([
        write_or_check(OUT / "dags.json", dag_doc, check),
        write_or_check(OUT / "dbt.json", dbt, check),
        write_or_check(OUT / "contracts.json", contracts, check),
        write_or_check(OUT / "samples.json", demo, check),
    ])
    print(json.dumps({
        "dags": len(dags),
        "models": len(dbt["models"]),
        "dbtTestsDeclared": dbt["testCount"],
        "geExpectations": len(contracts["expectations"]),
        "rowCounts": {k: v["rows"] for k, v in demo["layers"].items()},
        "partitions": demo["partitions"],
        "transform": time_transform(),
    }))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main(check="--check" in sys.argv))
