"""Generate realistic synthetic CDR (Call Detail Record) data as parquet files.

The output directory is partitioned by ``ingest_date`` so the Bronze ingest DAG
can use partition pruning. Schema is intentionally close to a real telecom
billing event so dbt models look authentic.

Callers and callees are drawn from a fixed, seeded pool of subscribers, each
with a stable plan, home market and activity level. Activity is heavy-tailed
(a few heavy users, a long tail of light ones) and a share of subscribers go
quiet part-way through the window, so the churn and ARPU marts have something
to separate. Output is deterministic for a given seed and end date.
"""

from __future__ import annotations

import math
import random
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from itertools import accumulate
from pathlib import Path

import pyarrow as pa
import pyarrow.parquet as pq
import typer
from faker import Faker
from rich.console import Console

app = typer.Typer(help="Synthetic CDR generator")
console = Console()


MARKETS = ["NORTH", "SOUTH", "EAST", "WEST", "CENTRAL"]
PLANS = ["BASIC_5GB", "PRO_25GB", "UNLIMITED", "FAMILY_50GB", "PREPAID"]
CALL_TYPES = ["VOICE", "SMS", "DATA"]

MARKET_WEIGHTS = [0.24, 0.26, 0.20, 0.18, 0.12]
PLAN_WEIGHTS = [0.22, 0.24, 0.24, 0.14, 0.16]


@dataclass(frozen=True)
class PlanProfile:
    activity: float  # multiplier on a subscriber's event rate
    mix: tuple[float, float, float]  # VOICE / SMS / DATA weights


PLAN_PROFILES = {
    "BASIC_5GB": PlanProfile(0.8, (0.45, 0.40, 0.15)),
    "PRO_25GB": PlanProfile(1.0, (0.40, 0.32, 0.28)),
    "UNLIMITED": PlanProfile(1.4, (0.32, 0.25, 0.43)),
    "FAMILY_50GB": PlanProfile(1.2, (0.40, 0.35, 0.25)),
    "PREPAID": PlanProfile(0.6, (0.45, 0.45, 0.10)),
}


@dataclass(frozen=True)
class Segment:
    share: float  # fraction of the pool
    median: float  # median relative activity (lognormal)
    sigma: float  # lognormal spread within the segment


SEGMENTS = {
    "light": Segment(0.25, 0.05, 0.6),
    "regular": Segment(0.67, 1.0, 0.6),
    "heavy": Segment(0.08, 4.0, 0.4),
}

DEFAULT_SUBSCRIBERS = 1_200
QUIET_SHARE = 0.12  # share of subscribers that stop generating events mid-window
QUIET_AFTER = (0.25, 0.65)  # where in the window (0..1) they go quiet
TRAVELLER_SHARE = 0.10
ROAM_RATE = {"home": 0.03, "traveller": 0.25}


@dataclass(frozen=True)
class Subscriber:
    msisdn: str
    plan_id: str
    market: str
    segment: str
    activity: float
    roam_rate: float
    quiet_after: float | None  # window position after which no events, or None


def _phone(rng: random.Random) -> str:
    return "+1" + "".join(str(rng.randint(0, 9)) for _ in range(10))


def make_subscribers(n: int, seed: int) -> list[Subscriber]:
    """Build a seeded pool of ``n`` subscribers with stable attributes."""
    if n < 2:
        raise ValueError("need at least 2 subscribers so callers have someone to call")
    rng = random.Random(f"subscribers-{seed}")
    seen: set[str] = set()
    pool: list[Subscriber] = []
    while len(pool) < n:
        msisdn = _phone(rng)
        if msisdn in seen:
            continue
        seen.add(msisdn)
        plan = rng.choices(PLANS, weights=PLAN_WEIGHTS)[0]
        market = rng.choices(MARKETS, weights=MARKET_WEIGHTS)[0]
        segment = rng.choices(list(SEGMENTS), weights=[x.share for x in SEGMENTS.values()])[0]
        seg = SEGMENTS[segment]
        activity = rng.lognormvariate(math.log(seg.median), seg.sigma)
        activity *= PLAN_PROFILES[plan].activity
        traveller = rng.random() < TRAVELLER_SHARE
        quiet_after = rng.uniform(*QUIET_AFTER) if rng.random() < QUIET_SHARE else None
        pool.append(
            Subscriber(
                msisdn=msisdn,
                plan_id=plan,
                market=market,
                segment=segment,
                activity=activity,
                roam_rate=ROAM_RATE["traveller" if traveller else "home"],
                quiet_after=quiet_after,
            )
        )
    return pool


def make_rows(
    n: int,
    seed: int,
    start: datetime,
    subscribers: list[Subscriber] | None = None,
    window_pos: float = 0.0,
) -> list[dict]:
    """Generate ``n`` CDRs for the day beginning at ``start``.

    ``window_pos`` is where this day sits in the generated window (0..1); a
    subscriber whose ``quiet_after`` is at or before it makes no calls.
    """
    rng = random.Random(seed)
    Faker.seed(seed)
    pool = subscribers if subscribers is not None else make_subscribers(DEFAULT_SUBSCRIBERS, seed)
    if len(pool) < 2:
        raise ValueError("need at least 2 subscribers so callers have someone to call")
    active = [s for s in pool if s.quiet_after is None or window_pos < s.quiet_after]
    if len(active) < 2:
        active = list(pool)
    cum_weights = list(accumulate(s.activity for s in active))

    rows: list[dict] = []
    for caller in rng.choices(active, cum_weights=cum_weights, k=n):
        call_type = rng.choices(CALL_TYPES, weights=PLAN_PROFILES[caller.plan_id].mix)[0]
        duration = int(rng.expovariate(1 / 90)) if call_type == "VOICE" else 0
        ts = start + timedelta(seconds=rng.randint(0, 86_399))
        callee = ""
        if call_type != "DATA":
            while not callee or callee == caller.msisdn:
                callee = rng.choices(active, cum_weights=cum_weights)[0].msisdn
        rows.append(
            {
                "cdr_id": str(uuid.UUID(int=rng.getrandbits(128), version=4)),
                "caller_msisdn": caller.msisdn,
                "callee_msisdn": callee,
                "start_time": ts,
                "duration_sec": duration,
                "bytes_used": rng.randint(1024, 50_000_000) if call_type == "DATA" else 0,
                "call_type": call_type,
                "market": caller.market,
                "plan_id": caller.plan_id,
                "is_roaming": rng.random() < caller.roam_rate,
                "ingest_date": ts.date().isoformat(),
            }
        )
    return rows


def generate(rows: int, days: int, seed: int, subscribers: int, end: datetime) -> list[dict]:
    """Generate ``rows`` CDRs over ``days`` daily partitions ending on ``end``."""
    pool = make_subscribers(subscribers, seed)
    first = end - timedelta(days=days - 1)
    per_day = rows // max(days, 1)
    all_rows: list[dict] = []
    for i in range(days):
        all_rows.extend(
            make_rows(
                per_day,
                seed=seed + i,
                start=first + timedelta(days=i),
                subscribers=pool,
                window_pos=i / days,
            )
        )
    random.Random(seed).shuffle(all_rows)
    return all_rows


def write_partitioned(rows: list[dict], out: Path) -> int:
    out.mkdir(parents=True, exist_ok=True)
    by_date: dict[str, list[dict]] = {}
    for r in rows:
        by_date.setdefault(r["ingest_date"], []).append(r)
    for date_str, day_rows in by_date.items():
        partition_dir = out / f"ingest_date={date_str}"
        partition_dir.mkdir(parents=True, exist_ok=True)
        table = pa.Table.from_pylist(day_rows)
        pq.write_table(table, partition_dir / "part-0000.parquet")
    return len(rows)


@app.command()
def main(
    rows: int = typer.Option(50_000, help="Number of CDR rows to generate"),
    out: Path = typer.Option(Path("data/raw"), help="Output directory"),
    days: int = typer.Option(3, help="Spread rows across this many days backwards from --end-date"),
    seed: int = typer.Option(42, help="Random seed"),
    subscribers: int = typer.Option(
        DEFAULT_SUBSCRIBERS, min=2, help="Size of the seeded subscriber pool"
    ),
    end_date: datetime | None = typer.Option(
        None, formats=["%Y-%m-%d"], help="Last partition date (UTC); defaults to today"
    ),
) -> None:
    """Generate ``rows`` CDR records partitioned by ``ingest_date``."""
    end = end_date.replace(tzinfo=UTC) if end_date else datetime.now(UTC)
    end = end.replace(hour=0, minute=0, second=0, microsecond=0)
    all_rows = generate(rows, days, seed, subscribers, end)
    n = write_partitioned(all_rows, out)
    console.print(
        f"[green]Wrote[/green] {n} CDRs from a {subscribers}-subscriber pool "
        f"across {days} day partitions to {out}"
    )


if __name__ == "__main__":
    app()
