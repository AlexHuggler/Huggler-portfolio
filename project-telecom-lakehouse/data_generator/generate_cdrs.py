"""Generate realistic synthetic CDR (Call Detail Record) data as parquet files.

The output directory is partitioned by ``ingest_date`` so the Bronze ingest DAG
can use partition pruning. Schema is intentionally close to a real telecom
billing event so dbt models look authentic.
"""

from __future__ import annotations

import random
import uuid
from datetime import UTC, datetime, timedelta
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


def _phone(rng: random.Random) -> str:
    return "+1" + "".join(str(rng.randint(0, 9)) for _ in range(10))


def make_rows(n: int, seed: int, start: datetime) -> list[dict]:
    rng = random.Random(seed)
    Faker.seed(seed)
    rows: list[dict] = []
    for _ in range(n):
        call_type = rng.choices(CALL_TYPES, weights=[0.4, 0.35, 0.25])[0]
        duration = (
            int(rng.expovariate(1 / 90)) if call_type == "VOICE" else 0
        )
        ts = start + timedelta(seconds=rng.randint(0, 86_399))
        rows.append(
            {
                "cdr_id": str(uuid.uuid4()),
                "caller_msisdn": _phone(rng),
                "callee_msisdn": _phone(rng) if call_type != "DATA" else "",
                "start_time": ts,
                "duration_sec": duration,
                "bytes_used": rng.randint(1024, 50_000_000) if call_type == "DATA" else 0,
                "call_type": call_type,
                "market": rng.choice(MARKETS),
                "plan_id": rng.choice(PLANS),
                "is_roaming": rng.random() < 0.05,
                "ingest_date": ts.date().isoformat(),
            }
        )
    return rows


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
    days: int = typer.Option(3, help="Spread rows across this many days backwards from today"),
    seed: int = typer.Option(42, help="Random seed"),
) -> None:
    """Generate ``rows`` CDR records partitioned by ``ingest_date``."""
    rng = random.Random(seed)
    today = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0)
    all_rows: list[dict] = []
    per_day = rows // max(days, 1)
    for d in range(days):
        day = today - timedelta(days=d)
        all_rows.extend(make_rows(per_day, seed=seed + d, start=day))
    rng.shuffle(all_rows)
    n = write_partitioned(all_rows, out)
    console.print(f"[green]Wrote[/green] {n} CDRs across {days} day partitions to {out}")


if __name__ == "__main__":
    app()
