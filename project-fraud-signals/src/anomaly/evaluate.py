"""Score the anomaly detectors against the producer's ground-truth labels.

Every event written by ``producer.generate`` carries a ``label`` field
(``normal``, ``velocity_burst``, ``impossible_travel``, ``amount_outlier``),
so detector quality is measurable rather than asserted. Evaluation is
account-level: a pattern is "caught" when the detector flags any event on an
account that truly carries that pattern. Event-level scoring would punish the
velocity detector for its deliberate flag-once-per-account design.
"""

from __future__ import annotations

import json
import time
from collections import defaultdict
from collections.abc import Iterable
from dataclasses import dataclass
from pathlib import Path

import typer
from rich.console import Console
from rich.table import Table

from anomaly.detect import Anomaly, detect_all

app = typer.Typer(help="Evaluate anomaly detectors against producer ground truth")
console = Console()

# Detector kind -> the producer label it is designed to catch.
KIND_TO_LABEL = {
    "velocity": "velocity_burst",
    "geo": "impossible_travel",
    "amount": "amount_outlier",
}


@dataclass(frozen=True)
class PatternScore:
    kind: str
    label: str
    true_accounts: int
    flagged_accounts: int
    true_positives: int
    precision: float
    recall: float
    f1: float


def _prf(tp: int, flagged: int, truth: int) -> tuple[float, float, float]:
    precision = tp / flagged if flagged else 0.0
    recall = tp / truth if truth else 0.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    return precision, recall, f1


def evaluate_accounts(
    events: Iterable[dict], anomalies: Iterable[Anomaly]
) -> list[PatternScore]:
    """Account-level precision/recall per detector kind."""
    labels_by_account: dict[str, set[str]] = defaultdict(set)
    for e in events:
        labels_by_account[e["account_id"]].add(e.get("label", "normal"))

    flagged_by_kind: dict[str, set[str]] = defaultdict(set)
    for a in anomalies:
        flagged_by_kind[a.kind].add(a.account_id)

    scores: list[PatternScore] = []
    for kind, label in KIND_TO_LABEL.items():
        truth = {acct for acct, labs in labels_by_account.items() if label in labs}
        flagged = flagged_by_kind.get(kind, set())
        tp = len(truth & flagged)
        precision, recall, f1 = _prf(tp, len(flagged), len(truth))
        scores.append(
            PatternScore(
                kind=kind,
                label=label,
                true_accounts=len(truth),
                flagged_accounts=len(flagged),
                true_positives=tp,
                precision=precision,
                recall=recall,
                f1=f1,
            )
        )
    return scores


def _read_jsonl(path: Path) -> list[dict]:
    with path.open("r", encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]


@app.command()
def main(
    path: Path = typer.Argument(..., help="Path to a labeled JSONL file of events"),
) -> None:
    """Run all detectors over PATH and score them against the embedded labels."""
    events = _read_jsonl(path)

    started = time.perf_counter()
    anomalies = detect_all(events)
    elapsed = time.perf_counter() - started
    throughput = len(events) / elapsed if elapsed > 0 else float("inf")

    scores = evaluate_accounts(events, anomalies)

    table = Table(title=f"Detector evaluation over {len(events)} labeled events")
    table.add_column("Detector")
    table.add_column("Ground-truth pattern")
    table.add_column("Accounts w/ pattern", justify="right")
    table.add_column("Accounts flagged", justify="right")
    table.add_column("Precision", justify="right")
    table.add_column("Recall", justify="right")
    table.add_column("F1", justify="right")
    for s in scores:
        table.add_row(
            s.kind,
            s.label,
            str(s.true_accounts),
            str(s.flagged_accounts),
            f"{s.precision:.2f}",
            f"{s.recall:.2f}",
            f"{s.f1:.2f}",
        )
    console.print(table)
    console.print(
        f"Scored {len(events)} events in {elapsed:.2f}s "
        f"({throughput:,.0f} events/sec, single process)"
    )


if __name__ == "__main__":
    app()
