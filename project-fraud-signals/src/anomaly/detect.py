"""Pure-Python anomaly detection over transaction events.

The functions here are deliberately framework-free so they can be unit tested
without Spark and reused inside a streaming consumer or a batch dbt model.
"""

from __future__ import annotations

import json
import statistics
from collections import defaultdict
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

import typer
from rich.console import Console
from rich.table import Table

app = typer.Typer(help="Score transaction events for fraud anomalies")
console = Console()


VELOCITY_WINDOW_SEC = 60
VELOCITY_THRESHOLD = 5
IMPOSSIBLE_TRAVEL_MIN_SEC_PER_HOP = 60 * 60  # 1 hour per country hop, simplistic
ZSCORE_THRESHOLD = 3.0


@dataclass(frozen=True)
class Anomaly:
    event_id: str
    account_id: str
    kind: str
    score: float
    detail: str


def _parse_ts(raw: str) -> datetime:
    return datetime.fromisoformat(raw)


def velocity_anomaly(events: Iterable[dict]) -> list[Anomaly]:
    """Flag accounts with >= VELOCITY_THRESHOLD events in any VELOCITY_WINDOW_SEC window."""
    by_account: dict[str, list[dict]] = defaultdict(list)
    for e in events:
        by_account[e["account_id"]].append(e)

    out: list[Anomaly] = []
    for account_id, evs in by_account.items():
        evs_sorted = sorted(evs, key=lambda e: _parse_ts(e["ts"]))
        for i in range(len(evs_sorted)):
            window_end = _parse_ts(evs_sorted[i]["ts"])
            window_start = window_end.timestamp() - VELOCITY_WINDOW_SEC
            count = 0
            for j in range(i, -1, -1):
                if _parse_ts(evs_sorted[j]["ts"]).timestamp() < window_start:
                    break
                count += 1
            if count >= VELOCITY_THRESHOLD:
                ev = evs_sorted[i]
                out.append(
                    Anomaly(
                        event_id=ev["event_id"],
                        account_id=account_id,
                        kind="velocity",
                        score=float(count),
                        detail=f"{count} events in {VELOCITY_WINDOW_SEC}s",
                    )
                )
                break
    return out


def geo_anomaly(events: Iterable[dict]) -> list[Anomaly]:
    """Flag impossible-travel: country change within a window too small for the hop."""
    by_account: dict[str, list[dict]] = defaultdict(list)
    for e in events:
        by_account[e["account_id"]].append(e)

    out: list[Anomaly] = []
    for account_id, evs in by_account.items():
        evs_sorted = sorted(evs, key=lambda e: _parse_ts(e["ts"]))
        prev = None
        for ev in evs_sorted:
            if prev is None:
                prev = ev
                continue
            if ev["country"] != prev["country"]:
                delta = (_parse_ts(ev["ts"]) - _parse_ts(prev["ts"])).total_seconds()
                if delta < IMPOSSIBLE_TRAVEL_MIN_SEC_PER_HOP:
                    out.append(
                        Anomaly(
                            event_id=ev["event_id"],
                            account_id=account_id,
                            kind="geo",
                            score=round(IMPOSSIBLE_TRAVEL_MIN_SEC_PER_HOP / max(delta, 1), 2),
                            detail=f"{prev['country']}->{ev['country']} in {int(delta)}s",
                        )
                    )
            prev = ev
    return out


def amount_zscore_anomaly(events: Iterable[dict]) -> list[Anomaly]:
    """Flag events whose amount is > ZSCORE_THRESHOLD stddevs above the account mean."""
    by_account: dict[str, list[dict]] = defaultdict(list)
    for e in events:
        by_account[e["account_id"]].append(e)

    out: list[Anomaly] = []
    for account_id, evs in by_account.items():
        amounts = [float(e["amount"]) for e in evs]
        if len(amounts) < 4:
            continue
        mean = statistics.fmean(amounts)
        stdev = statistics.pstdev(amounts) or 1.0
        for ev in evs:
            z = (float(ev["amount"]) - mean) / stdev
            if z >= ZSCORE_THRESHOLD:
                out.append(
                    Anomaly(
                        event_id=ev["event_id"],
                        account_id=account_id,
                        kind="amount",
                        score=round(z, 2),
                        detail=f"amount={ev['amount']} z={z:.2f}",
                    )
                )
    return out


def detect_all(events: Iterable[dict]) -> list[Anomaly]:
    cached = list(events)
    return [
        *velocity_anomaly(cached),
        *geo_anomaly(cached),
        *amount_zscore_anomaly(cached),
    ]


def _read_jsonl(path: Path) -> list[dict]:
    with path.open("r", encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]


@app.command()
def main(
    path: Path = typer.Argument(..., help="Path to a JSONL file of events"),
    limit: int = typer.Option(10, help="Number of anomalies to print per kind"),
) -> None:
    """Score the given JSONL events and print a per-kind summary."""
    events = _read_jsonl(path)
    anomalies = detect_all(events)
    by_kind: dict[str, list[Anomaly]] = defaultdict(list)
    for a in anomalies:
        by_kind[a.kind].append(a)

    table = Table(title=f"Fraud detection over {len(events)} events")
    table.add_column("Kind")
    table.add_column("Count", justify="right")
    table.add_column("Top accounts (score)", overflow="fold")
    for kind in ("velocity", "geo", "amount"):
        items = sorted(by_kind.get(kind, []), key=lambda a: a.score, reverse=True)
        top = ", ".join(f"{a.account_id[:8]} ({a.score})" for a in items[:limit])
        table.add_row(kind, str(len(items)), top or "-")

    console.print(table)


if __name__ == "__main__":
    app()
