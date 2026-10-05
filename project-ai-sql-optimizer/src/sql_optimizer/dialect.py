"""Resolve which sqlglot dialect a query should be parsed with.

Shared by the CLI and the benchmark so both code paths agree on how a file
is read.
"""

from __future__ import annotations

import re

_HEADER_SCAN_LINES = 5
_ENGINE_HEADER = re.compile(
    r"^[ \t]*--[ \t]*engine[ \t]*:[ \t]*(\w+)", re.IGNORECASE | re.MULTILINE
)
_SNOWFLAKE_MARKERS = ("QUALIFY ", "ILIKE ", "FLATTEN(")


def detect_dialect(sql: str, override: str | None = None) -> str:
    """Return the dialect for ``sql``.

    Precedence: an explicit ``override``, then a ``-- engine: <name>`` header
    comment in the first few lines, then a keyword heuristic (Snowflake-only
    syntax means snowflake, otherwise spark).
    """
    if override:
        return override
    head = "\n".join(sql.splitlines()[:_HEADER_SCAN_LINES])
    if match := _ENGINE_HEADER.search(head):
        return match.group(1).lower()
    upper = sql.upper()
    if any(marker in upper for marker in _SNOWFLAKE_MARKERS):
        return "snowflake"
    return "spark"
