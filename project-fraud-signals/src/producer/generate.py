"""Synthetic transaction event generator with embedded fraud patterns.

Three patterns get injected at configurable rates:

* velocity_burst   -- multiple high-amount transactions on the same account inside a
                      short window
* impossible_travel -- consecutive transactions from countries that cannot be reached
                      between their timestamps
* amount_outlier   -- a single transaction whose amount is far above the account's
                      historical mean (Z-score > 3)

Output goes to a Kafka topic if ``--sink kafka`` is selected and Kafka is reachable,
otherwise it falls back to a local JSON Lines file.
"""

from __future__ import annotations

import json
import random
import time
import uuid
from collections.abc import Iterator
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from pathlib import Path

import typer
from faker import Faker
from rich.console import Console

app = typer.Typer(help="Synthetic fraud-signals event producer")
console = Console()


COUNTRIES = ["US", "CA", "GB", "DE", "FR", "ES", "IT", "AU", "BR", "JP", "ZA", "NG"]
MERCHANT_CATEGORIES = [
    "grocery",
    "gas",
    "restaurant",
    "online_retail",
    "electronics",
    "travel",
    "atm_withdrawal",
    "subscription",
]


@dataclass
class Account:
    account_id: str
    home_country: str
    mean_amount: float
    std_amount: float
    last_country: str = ""
    last_ts: datetime | None = None
    history: list[float] = field(default_factory=list)


def make_accounts(n: int, seed: int) -> list[Account]:
    fk = Faker()
    Faker.seed(seed)
    rng = random.Random(seed)
    accounts: list[Account] = []
    for _ in range(n):
        home = rng.choice(COUNTRIES)
        mean = rng.uniform(20, 250)
        std = mean * rng.uniform(0.2, 0.5)
        accounts.append(
            Account(
                account_id=fk.uuid4(),
                home_country=home,
                mean_amount=round(mean, 2),
                std_amount=round(std, 2),
                last_country=home,
            )
        )
    return accounts


def normal_event(account: Account, now: datetime, rng: random.Random) -> dict:
    amount = max(1.0, rng.gauss(account.mean_amount, account.std_amount))
    return {
        "event_id": str(uuid.uuid4()),
        "account_id": account.account_id,
        "amount": round(amount, 2),
        "currency": "USD",
        "merchant_category": rng.choice(MERCHANT_CATEGORIES),
        "country": account.last_country or account.home_country,
        "device_id": f"dev-{rng.randint(1000, 9999)}",
        "ts": now.isoformat(),
        "label": "normal",
    }


def velocity_burst(account: Account, now: datetime, rng: random.Random) -> list[dict]:
    """5-8 high-amount events on the same account within ~30 seconds."""
    out: list[dict] = []
    n = rng.randint(5, 8)
    for i in range(n):
        ts = now + timedelta(seconds=i * 4)
        e = normal_event(account, ts, rng)
        e["amount"] = round(account.mean_amount * rng.uniform(3, 8), 2)
        e["label"] = "velocity_burst"
        out.append(e)
    return out


def impossible_travel(account: Account, now: datetime, rng: random.Random) -> list[dict]:
    """Two events 90 seconds apart from countries that cannot be reached that fast."""
    far = next(c for c in COUNTRIES if c != account.last_country)
    a = normal_event(account, now, rng)
    a["country"] = account.last_country or account.home_country
    a["label"] = "impossible_travel"
    b = normal_event(account, now + timedelta(seconds=90), rng)
    b["country"] = far
    b["label"] = "impossible_travel"
    account.last_country = far
    return [a, b]


def amount_outlier(account: Account, now: datetime, rng: random.Random) -> dict:
    e = normal_event(account, now, rng)
    e["amount"] = round(account.mean_amount + 6 * account.std_amount, 2)
    e["label"] = "amount_outlier"
    return e


def event_stream(
    accounts: list[Account],
    rate_per_sec: float,
    duration_sec: float,
    fraud_rate: float,
    seed: int,
) -> Iterator[dict]:
    rng = random.Random(seed)
    start = datetime.now(tz=UTC)
    deadline = start + timedelta(seconds=duration_sec)
    interval = 1.0 / rate_per_sec
    now = start

    while now < deadline:
        account = rng.choice(accounts)
        if rng.random() < fraud_rate:
            pattern = rng.choice(["velocity", "geo", "amount"])
            if pattern == "velocity":
                for ev in velocity_burst(account, now, rng):
                    yield ev
            elif pattern == "geo":
                for ev in impossible_travel(account, now, rng):
                    yield ev
            else:
                yield amount_outlier(account, now, rng)
        else:
            account.last_country = account.last_country or account.home_country
            yield normal_event(account, now, rng)
        now = now + timedelta(seconds=interval)


def write_jsonl(events: Iterator[dict], out: Path) -> int:
    out.parent.mkdir(parents=True, exist_ok=True)
    n = 0
    with out.open("w", encoding="utf-8") as f:
        for ev in events:
            f.write(json.dumps(ev) + "\n")
            n += 1
    return n


def write_kafka(events: Iterator[dict], topic: str, bootstrap: str) -> int:
    try:
        from kafka import KafkaProducer  # type: ignore[import-untyped]
    except ImportError as e:
        raise RuntimeError(
            "kafka-python not installed. Run `make install-streaming` or use --sink jsonl."
        ) from e

    producer = KafkaProducer(
        bootstrap_servers=bootstrap,
        value_serializer=lambda v: json.dumps(v).encode("utf-8"),
        key_serializer=lambda k: k.encode("utf-8") if k else None,
        linger_ms=20,
        retries=3,
    )
    n = 0
    for ev in events:
        producer.send(topic, key=ev["account_id"], value=ev)
        n += 1
    producer.flush()
    producer.close()
    return n


@app.command()
def main(
    sink: str = typer.Option("jsonl", help="Where to write events: 'jsonl' or 'kafka'"),
    rate: float = typer.Option(50.0, help="Events per second"),
    duration: float = typer.Option(30.0, help="Generation duration in seconds"),
    fraud_rate: float = typer.Option(0.05, help="Fraction of events that trigger a fraud pattern"),
    accounts: int = typer.Option(200, help="Number of distinct accounts"),
    out: Path = typer.Option(Path("data/events.jsonl"), help="JSONL output path"),
    topic: str = typer.Option("tx-events", help="Kafka topic"),
    bootstrap: str = typer.Option("localhost:9092", help="Kafka bootstrap servers"),
    seed: int = typer.Option(42, help="Random seed for reproducibility"),
) -> None:
    """Generate a configurable stream of synthetic transaction events."""
    started = time.time()
    accs = make_accounts(accounts, seed)
    events = event_stream(
        accounts=accs,
        rate_per_sec=rate,
        duration_sec=duration,
        fraud_rate=fraud_rate,
        seed=seed,
    )

    if sink == "kafka":
        try:
            n = write_kafka(events, topic=topic, bootstrap=bootstrap)
            console.print(f"[green]Wrote[/green] {n} events to Kafka topic {topic!r}")
            return
        except Exception as e:
            console.print(f"[yellow]Kafka unavailable[/yellow] ({e}); falling back to JSONL")

    n = write_jsonl(events, out)
    console.print(
        f"[green]Wrote[/green] {n} events to {out} in {time.time() - started:.1f}s"
    )


if __name__ == "__main__":
    app()
