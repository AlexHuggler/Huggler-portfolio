"""Shared helpers for the artifact exporters.

Each exporter reads a sibling project's real source files / outputs and writes
a compact, deterministic JSON fixture under ``portfolio-site/src/data``. They
run inside the project's own uv environment, e.g.

    uv run --project ../project-ai-sql-optimizer python scripts/artifacts/sqlopt.py

and accept ``--check`` to verify the committed fixture is up to date without
writing anything (exit 1 on drift).
"""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

SITE = Path(__file__).resolve().parents[2]
REPO = SITE.parent
DATA = SITE / "src" / "data"


def project(name: str) -> Path:
    return REPO / name


def rel(path: Path) -> str:
    """Repo-relative POSIX path, for provenance fields."""
    return path.resolve().relative_to(REPO).as_posix()


def digest(paths: list[Path]) -> str:
    """Content hash of source files (stable across commits, unlike a git SHA)."""
    h = hashlib.sha256()
    for p in sorted(paths):
        h.update(rel(p).encode())
        h.update(p.read_bytes())
    return h.hexdigest()[:12]


def dump(obj: object) -> str:
    return json.dumps(obj, indent=2, ensure_ascii=False, sort_keys=False) + "\n"


def write_or_check(path: Path, obj: object, check: bool) -> bool:
    """Write ``obj`` as JSON, or (check mode) report whether it would change."""
    text = dump(obj)
    if check:
        current = path.read_text(encoding="utf-8") if path.exists() else ""
        if current != text:
            print(f"DRIFT {rel(path)}", file=sys.stderr)
            return False
        print(f"ok    {rel(path)}", file=sys.stderr)
        return True
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
    print(f"wrote {rel(path)}", file=sys.stderr)
    return True


def strip_sql_comments(sql: str) -> str:
    return "\n".join(line.split("--", 1)[0] for line in sql.splitlines())
