"""Export fraud-signals artifacts from a real ``make eval`` run.

Reads project-fraud-signals/data/eval_events.jsonl (written by ``make eval``:
seed 42, 1,000 accounts, 50 events/s for 300 s), runs the real detectors and
evaluator, sweeps the two tunable thresholds, and writes:

* src/data/fraud/detectors.json  — real detector source, constants, P/R, sweeps
* src/data/fraud/dashboard.json  — aggregates for the dashboards page
* src/data/fraud/feed.json       — a contiguous replay window with verdicts

    uv run --project ../project-fraud-signals python scripts/artifacts/fraud.py [--check]

Raw event_ids are uuid4 and timestamps are wall-clock, so both are normalised
(index-based ids, seconds since the first event) to keep fixtures stable.
Throughput timing is printed on stdout for scripts/measure.py.
"""

from __future__ import annotations

import inspect
import json
import math
import statistics
import sys
import time
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _common import DATA, digest, project, rel, write_or_check  # noqa: E402

from anomaly import detect  # noqa: E402
from anomaly.evaluate import KIND_TO_LABEL, evaluate_accounts  # noqa: E402
from producer import generate  # noqa: E402

PROJECT = project("project-fraud-signals")
EVENTS = PROJECT / "data" / "eval_events.jsonl"
SOURCES = [
    PROJECT / "src" / "anomaly" / "detect.py",
    PROJECT / "src" / "anomaly" / "evaluate.py",
    PROJECT / "src" / "producer" / "generate.py",
]
OUT_DIR = DATA / "fraud"

LABELS = ["normal", "velocity_burst", "impossible_travel", "amount_outlier"]
VELOCITY_SWEEP = list(range(3, 11))
ZSCORE_SWEEP = [2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0]
FEED_SIZE = 160
BUCKET_SEC = 5


def load() -> list[dict]:
    with EVENTS.open(encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]


def scores_json(events: list[dict], anomalies) -> list[dict]:
    return [
        {
            "kind": s.kind,
            "label": s.label,
            "trueAccounts": s.true_accounts,
            "flaggedAccounts": s.flagged_accounts,
            "truePositives": s.true_positives,
            "precision": round(s.precision, 4),
            "recall": round(s.recall, 4),
            "f1": round(s.f1, 4),
        }
        for s in evaluate_accounts(events, anomalies)
    ]


def sweep(events: list[dict], attr: str, values: list, fn, kind: str) -> list[dict]:
    original = getattr(detect, attr)
    rows: list[dict] = []
    try:
        for v in values:
            setattr(detect, attr, v)
            s = next(x for x in scores_json(events, fn(events)) if x["kind"] == kind)
            rows.append({
                "threshold": v,
                "precision": s["precision"],
                "recall": s["recall"],
                "f1": s["f1"],
                "flaggedAccounts": s["flaggedAccounts"],
            })
    finally:
        setattr(detect, attr, original)
    return rows


def amount_bucket(amount: float) -> str:
    edges = [0, 25, 50, 100, 200, 400, 800, 1600, 3200]
    for lo, hi in zip(edges, edges[1:], strict=False):
        if amount < hi:
            return f"{lo}-{hi}"
    return f"{edges[-1]}+"


def main(check: bool) -> int:
    events = load()
    t0 = datetime.fromisoformat(events[0]["ts"])
    rel_ts = [round((datetime.fromisoformat(e["ts"]) - t0).total_seconds(), 2) for e in events]

    anomalies = detect.detect_all(events)
    scores = scores_json(events, anomalies)
    flagged_by_event: dict[str, list[str]] = defaultdict(list)
    flagged_accounts: dict[str, set[str]] = defaultdict(set)
    for a in anomalies:
        flagged_by_event[a.event_id].append(a.kind)
        flagged_accounts[a.kind].add(a.account_id)

    accounts = sorted({e["account_id"] for e in events})
    account_alias = {a: f"A{idx:04d}" for idx, a in enumerate(accounts)}
    label_counts = Counter(e["label"] for e in events)

    # ---- detectors.json -------------------------------------------------
    detectors = {
        "_meta": {
            "synthetic": True,
            "generatedBy": "portfolio-site/scripts/artifacts/fraud.py",
            "source": rel(PROJECT),
            "sourceDigest": digest(SOURCES),
            "note": "Real detector code and account-level evaluation over the make eval set (seed 42).",
        },
        "dataset": {
            "events": len(events),
            "accounts": len(accounts),
            "ratePerSec": 50,
            "durationSec": 300,
            "producerFraudRate": 0.05,
            "labeledEvents": len(events) - label_counts["normal"],
            "labeledEventShare": round((len(events) - label_counts["normal"]) / len(events), 4),
            "labelCounts": {k: label_counts.get(k, 0) for k in LABELS},
            "seed": 42,
        },
        "constants": {
            "VELOCITY_WINDOW_SEC": detect.VELOCITY_WINDOW_SEC,
            "VELOCITY_THRESHOLD": detect.VELOCITY_THRESHOLD,
            "IMPOSSIBLE_TRAVEL_MIN_SEC_PER_HOP": detect.IMPOSSIBLE_TRAVEL_MIN_SEC_PER_HOP,
            "ZSCORE_THRESHOLD": detect.ZSCORE_THRESHOLD,
        },
        "kindToLabel": KIND_TO_LABEL,
        "source": {
            "velocity": inspect.getsource(detect.velocity_anomaly),
            "geo": inspect.getsource(detect.geo_anomaly),
            "amount": inspect.getsource(detect.amount_zscore_anomaly),
        },
        "scores": scores,
        "sweeps": {
            "velocity": sweep(events, "VELOCITY_THRESHOLD", VELOCITY_SWEEP,
                              detect.velocity_anomaly, "velocity"),
            "amount": sweep(events, "ZSCORE_THRESHOLD", ZSCORE_SWEEP,
                            detect.amount_zscore_anomaly, "amount"),
        },
        "normalRatePerAccountPerMin": round(
            label_counts["normal"] / len(accounts) / (300 / 60), 3
        ),
    }

    # ---- dashboard.json --------------------------------------------------
    by_category: dict[str, Counter] = defaultdict(Counter)
    by_country: dict[str, Counter] = defaultdict(Counter)
    amounts: dict[str, Counter] = defaultdict(Counter)
    for e in events:
        by_category[e["merchant_category"]][e["label"]] += 1
        by_country[e["country"]][e["label"]] += 1
        amounts[amount_bucket(float(e["amount"]))][e["label"]] += 1

    n_buckets = math.ceil((max(rel_ts) + 0.001) / BUCKET_SEC)
    timeline = [{"t": i * BUCKET_SEC, "events": 0, "labeled": 0, "flagged": 0}
                for i in range(n_buckets)]
    for e, ts in zip(events, rel_ts, strict=True):
        b = timeline[int(ts // BUCKET_SEC)]
        b["events"] += 1
        if e["label"] != "normal":
            b["labeled"] += 1
        if e["event_id"] in flagged_by_event:
            b["flagged"] += 1

    travel_dest = Counter()
    by_account: dict[str, list[dict]] = defaultdict(list)
    for e in events:
        if e["label"] == "impossible_travel":
            by_account[e["account_id"]].append(e)
    for evs in by_account.values():
        evs.sort(key=lambda e: e["ts"])
        for prev, cur in zip(evs, evs[1:], strict=False):
            if cur["country"] != prev["country"]:
                travel_dest[cur["country"]] += 1

    def rows(table: dict[str, Counter], key: str) -> list[dict]:
        out = []
        for k in sorted(table):
            c = table[k]
            total = sum(c.values())
            out.append({key: k, "total": total, **{lab: c.get(lab, 0) for lab in LABELS},
                        "labeledShare": round(1 - c.get("normal", 0) / total, 4)})
        return out

    bucket_order = [amount_bucket(x) for x in (1, 30, 60, 150, 300, 600, 1200, 2000, 5000)]
    dashboard = {
        "_meta": {
            "synthetic": True,
            "generatedBy": "portfolio-site/scripts/artifacts/fraud.py",
            "source": rel(EVENTS) + " (make eval, seed 42)",
            "sourceDigest": digest(SOURCES),
            "note": (
                "Aggregated from the labeled make eval event set. The producer applies its "
                "5% fraud rate per decision; velocity bursts emit 5-8 events, so the labeled "
                "share of events is higher than 5%."
            ),
        },
        "kpis": {
            "events": len(events),
            "accounts": len(accounts),
            "labeledEvents": len(events) - label_counts["normal"],
            "labeledEventShare": detectors["dataset"]["labeledEventShare"],
            "flaggedEvents": len(flagged_by_event),
            "flaggedAccounts": len(set().union(*flagged_accounts.values())),
        },
        "labelCounts": detectors["dataset"]["labelCounts"],
        "byCategory": rows(by_category, "category"),
        "byCountry": rows(by_country, "country"),
        "amountBuckets": [
            {"bucket": b, **{lab: amounts[b].get(lab, 0) for lab in LABELS}}
            for b in dict.fromkeys(bucket_order)
        ],
        "timeline": timeline,
        "bucketSec": BUCKET_SEC,
        "travelDestinations": dict(travel_dest.most_common()),
        "countries": generate.COUNTRIES,
        "scores": scores,
    }

    # ---- feed.json ---------------------------------------------------------
    # First window of FEED_SIZE events that contains every label and at least
    # one flagged-but-normal event (a false positive worth showing).
    start = 0
    for i in range(0, len(events) - FEED_SIZE, 10):
        window = events[i:i + FEED_SIZE]
        labs = {e["label"] for e in window}
        fp = any(e["label"] == "normal" and e["event_id"] in flagged_by_event for e in window)
        if set(LABELS) <= labs and fp:
            start = i
            break
    feed_events = []
    for idx in range(start, start + FEED_SIZE):
        e = events[idx]
        feed_events.append({
            "i": idx,
            "t": round(rel_ts[idx] - rel_ts[start], 2),
            "account": account_alias[e["account_id"]],
            "amount": e["amount"],
            "category": e["merchant_category"],
            "country": e["country"],
            "label": e["label"],
            "flags": sorted(flagged_by_event.get(e["event_id"], [])),
            "accountFlags": sorted(k for k, accts in flagged_accounts.items()
                                   if e["account_id"] in accts),
        })
    feed = {
        "_meta": {
            "synthetic": True,
            "generatedBy": "portfolio-site/scripts/artifacts/fraud.py",
            "source": rel(EVENTS) + " (make eval, seed 42)",
            "note": (
                "A contiguous slice of the evaluation stream in producer order. Account ids "
                "are aliased; 't' is seconds since the slice's first event. 'flags' are "
                "event-level detector hits over the full 300 s stream; 'accountFlags' are the "
                "account-level verdicts the evaluator scores."
            ),
        },
        "offset": start,
        "events": feed_events,
    }

    ok = all([
        write_or_check(OUT_DIR / "detectors.json", detectors, check),
        write_or_check(OUT_DIR / "dashboard.json", dashboard, check),
        write_or_check(OUT_DIR / "feed.json", feed, check),
    ])

    timings = []
    for _ in range(5):
        t = time.perf_counter()
        detect.detect_all(events)
        timings.append(time.perf_counter() - t)
    med = statistics.median(timings)
    print(json.dumps({
        "dataset": detectors["dataset"],
        "scores": scores,
        "sweeps": detectors["sweeps"],
        "throughput": {
            "events": len(events),
            "secondsMedian": round(med, 4),
            "eventsPerSec": round(len(events) / med),
            "runs": len(timings),
        },
    }))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main(check="--check" in sys.argv))
