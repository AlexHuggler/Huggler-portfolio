#!/usr/bin/env python3
"""Measurement recorder — the only way numbers get into src/data/measured.json.

    python3 scripts/measure.py run      # install + test + measure all 3 projects, then render
    python3 scripts/measure.py render   # re-render labels from the stored evaluations only

``run`` executes each project's own make targets, saves ANSI-stripped
transcripts under src/data/measurements/, runs the artifact exporters in the
project's uv environment, and cross-checks the exporter's numbers against what
the make target printed (exit 1 on any mismatch). ``render`` turns the stored
evaluations into display metrics via scripts/measure_spec.py, so a label edit
never involves typing a number.

Requires uv and network access to PyPI for first-time installs. dbt runs with
a throwaway profile + target dir outside the repo so no *.duckdb or
profiles.yml lands in the working tree.
"""

from __future__ import annotations

import datetime as dt
import json
import os
import platform
import re
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
SITE = HERE.parent
REPO = SITE.parent
MEASURED = SITE / "src" / "data" / "measured.json"
TRANSCRIPTS = SITE / "src" / "data" / "measurements"

sys.path.insert(0, str(HERE))
from measure_spec import NOT_MEASURED, render  # noqa: E402

ANSI = re.compile(r"\x1b\[[0-9;]*[A-Za-z]")
ENV = {**os.environ, "COLUMNS": "200", "NO_COLOR": "1", "TERM": "dumb"}


class Mismatch(Exception):
    pass


def sh(cmd: list[str] | str, cwd: Path, env: dict | None = None) -> str:
    shell = isinstance(cmd, str)
    proc = subprocess.run(
        cmd, cwd=cwd, env=env or ENV, shell=shell, capture_output=True, text=True, check=False
    )
    out = ANSI.sub("", proc.stdout + proc.stderr)
    if proc.returncode != 0:
        print(out[-4000:], file=sys.stderr)
        raise SystemExit(f"command failed ({proc.returncode}): {cmd} in {cwd}")
    return out


def pytest_counts(out: str) -> dict:
    m = re.search(r"(\d+) passed(?:, (\d+) skipped)?", out)
    if not m:
        raise Mismatch("could not parse pytest summary")
    return {"passed": int(m.group(1)), "skipped": int(m.group(2) or 0)}


def table_rows(out: str) -> list[list[str]]:
    rows = []
    for line in out.splitlines():
        if line.startswith("│"):
            rows.append([c.strip() for c in line.strip("│").split("│")])
    return rows


def exporter(name: str, project: str, check: bool = False) -> dict:
    args = ["uv", "run", "--project", str(REPO / project), "python",
            str(HERE / "artifacts" / f"{name}.py")]
    if check:
        args.append("--check")
    out = sh(args, SITE)
    last = [ln for ln in out.splitlines() if ln.startswith("{")][-1]
    return json.loads(last)


def transcript(name: str, sections: list[tuple[str, str]]) -> str:
    TRANSCRIPTS.mkdir(parents=True, exist_ok=True)
    body = "\n".join(f"$ {cmd}\n{out.rstrip()}\n" for cmd, out in sections)
    path = TRANSCRIPTS / f"{name}.txt"
    path.write_text(body, encoding="utf-8")
    return path.relative_to(SITE).as_posix()


def close(a: float, b: float, places: int = 2) -> bool:
    return round(a, places) == round(b, places)


# --------------------------------------------------------------------------- #

def measure_sqlopt() -> dict:
    p = REPO / "project-ai-sql-optimizer"
    sh(["make", "install"], p)
    test = sh(["make", "test"], p)
    bench = sh(["make", "benchmark"], p)
    exp = exporter("sqlopt", "project-ai-sql-optimizer")
    printed = {r[0]: r for r in table_rows(bench) if len(r) == 4 and r[0] != "Category"}
    for row in exp["byCategory"]:
        got = printed[row["category"]]
        if not (close(float(got[2]), row["keywordOverlap"]) and close(float(got[3]), row["findingsHitRate"])):
            raise Mismatch(f"sqlopt {row['category']}: transcript {got} vs exporter {row}")
    return {
        "method": "make benchmark (dry run) over corpus/queries/*.sql vs corpus/ground_truth.yaml",
        "transcript": transcript("ai-sql-optimizer", [("make test", test), ("make benchmark", bench)]),
        "tests": pytest_counts(test),
        **exp,
    }


def measure_fraud() -> dict:
    p = REPO / "project-fraud-signals"
    sh(["make", "install"], p)
    test = sh(["make", "test"], p)
    ev = sh(["make", "eval"], p)
    exp = exporter("fraud", "project-fraud-signals")
    printed = {r[0]: r for r in table_rows(ev) if len(r) == 7 and r[0] != "Detector"}
    for s in exp["scores"]:
        got = printed[s["kind"]]
        expect = [str(s["trueAccounts"]), str(s["flaggedAccounts"])]
        if got[2:4] != expect or not all(
            close(float(g), s[k]) for g, k in zip(got[4:], ("precision", "recall", "f1"), strict=True)
        ):
            raise Mismatch(f"fraud {s['kind']}: transcript {got} vs exporter {s}")
    m = re.search(r"Scored (\d+) events", ev)
    if not m or int(m.group(1)) != exp["dataset"]["events"]:
        raise Mismatch("fraud event count mismatch")
    default = next(r for r in exp["sweeps"]["velocity"] if r["threshold"] == 5)
    v = next(s for s in exp["scores"] if s["kind"] == "velocity")
    if not close(default["precision"], v["precision"], 4):
        raise Mismatch("velocity sweep @5 does not reproduce make eval")
    return {
        "method": "make eval: producer seed 42, 1,000 accounts, 50 ev/s × 300 s; account-level P/R",
        "transcript": transcript("fraud-signals", [("make test", test), ("make eval", ev)]),
        "tests": pytest_counts(test),
        **exp,
    }


def measure_telecom() -> dict:
    p = REPO / "project-telecom-lakehouse"
    sh(["uv", "sync", "--extra", "dev", "--extra", "dbt"], p)
    test = sh(["make", "test"], p)
    demo = sh(["make", "demo"], p)
    exp = exporter("telecom", "project-telecom-lakehouse")
    printed = {r[0]: int(r[1].replace(",", "")) for r in table_rows(demo) if len(r) == 2 and r[0] != "Layer"}
    want = {
        "Bronze": exp["rowCounts"]["bronze"],
        "Silver": exp["rowCounts"]["silver"],
        "Gold / revenue_by_market": exp["rowCounts"]["gold.revenue_by_market"],
        "Gold / arpu_monthly": exp["rowCounts"]["gold.arpu_monthly"],
        "Gold / churn_signals": exp["rowCounts"]["gold.churn_signals"],
    }
    if printed != want:
        raise Mismatch(f"telecom row counts: transcript {printed} vs exporter {want}")

    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        (tmp_path / "profiles.yml").write_text(
            "telecom:\n  target: local\n  outputs:\n    local:\n      type: duckdb\n"
            f"      path: \"{tmp_path / 'telecom.duckdb'}\"\n      schema: main\n      threads: 4\n",
            encoding="utf-8",
        )
        dbt = sh(
            ["uv", "run", "dbt", "build", "--target-path", str(tmp_path / "target"),
             "--log-path", str(tmp_path / "logs")],
            p / "dbt_telecom", env={**ENV, "DBT_PROFILES_DIR": str(tmp_path)},
        )
    dbt = re.sub(r"^\d\d:\d\d:\d\d\s+", "", dbt, flags=re.M)
    m = re.search(r"Finished running (\d+) table models?, (\d+) data tests?, (\d+) view models?", dbt)
    s = re.search(r"PASS=(\d+) WARN=(\d+) ERROR=(\d+) SKIP=(\d+).*TOTAL=(\d+)", dbt)
    if not m or not s:
        raise Mismatch("could not parse dbt build summary")
    models = int(m.group(1)) + int(m.group(3))
    tests = int(m.group(2))
    if tests != exp["dbtTestsDeclared"] or models != exp["models"]:
        raise Mismatch(f"dbt ran {models} models / {tests} tests; schema declares {exp['models']} / {exp['dbtTestsDeclared']}")
    if int(s.group(3)) or int(s.group(5)) != int(s.group(1)):
        raise Mismatch("dbt build had failures")
    dbt_tail = "\n".join(ln for ln in dbt.splitlines() if re.search(r"PASS|Finished|Completed|Done\.", ln))
    return {
        "method": "make demo (seed 42) → DuckDB medallion transform; dbt build over the same raw parquet",
        "transcript": transcript("telecom-lakehouse", [
            ("make test", test), ("make demo", demo), ("dbt build  # scratch profile", dbt_tail),
        ]),
        "tests": pytest_counts(test),
        "dbt": {"models": models, "tests": tests, "testsPassed": tests},
        **exp,
    }


def environment() -> dict:
    cpu = "unknown"
    try:
        for line in Path("/proc/cpuinfo").read_text().splitlines():
            if line.startswith("model name"):
                cpu = line.split(":", 1)[1].strip()
                break
    except OSError:
        pass
    uv = subprocess.run(["uv", "--version"], capture_output=True, text=True).stdout.strip()
    return {
        "os": platform.platform(terse=True),
        "python": platform.python_version(),
        "uv": uv,
        "cpu": cpu,
        "cpus": os.cpu_count(),
    }


def write(doc: dict) -> None:
    MEASURED.write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def cmd_render() -> None:
    doc = json.loads(MEASURED.read_text(encoding="utf-8"))
    site, projects, metrics = render(doc["evaluations"])
    doc.update({"site": site, "projects": projects, "metrics": metrics, "notMeasured": NOT_MEASURED})
    write(doc)
    print(f"rendered {len(metrics)} metrics → {MEASURED.relative_to(REPO)}")


def cmd_run() -> None:
    evaluations = {
        "ai-sql-optimizer": measure_sqlopt(),
        "fraud-signals": measure_fraud(),
        "telecom-lakehouse": measure_telecom(),
    }
    today = dt.date.today()
    doc = {
        "schemaVersion": 2,
        "measuredAt": today.strftime("%Y-%m"),
        "measuredOn": today.isoformat(),
        "environment": "Linux container, single process, no-infra demo paths; all data synthetic (seed 42)",
        "environmentDetail": environment(),
        "evaluations": evaluations,
    }
    write(doc)
    cmd_render()


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    try:
        if cmd == "run":
            cmd_run()
        elif cmd == "render":
            cmd_render()
        else:
            raise SystemExit(__doc__)
    except Mismatch as e:
        raise SystemExit(f"MISMATCH: {e}") from e
