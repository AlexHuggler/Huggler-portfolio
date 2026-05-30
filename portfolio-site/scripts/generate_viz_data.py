#!/usr/bin/env python3
"""Generate aggregated visualization datasets for the Data Visualizations page.

This script reproduces (in dependency-free, stdlib-only form) the same domains
modeled by the three project generators and aggregates them down to compact
JSON that the Apache ECharts dashboards consume at build time:

* Fraud  -> mirrors project-fraud-signals/src/producer/generate.py
            (COUNTRIES, MERCHANT_CATEGORIES, the velocity / impossible-travel /
             amount-outlier patterns)
* Telecom-> mirrors project-telecom-lakehouse/data_generator/generate_cdrs.py
            (MARKETS, PLANS, CALL_TYPES, partitioned CDRs)
* SQLOpt -> mirrors project-ai-sql-optimizer/corpus (5 optimization categories,
            heuristic analyzer rules)

All randomness is seeded (seed=42, matching the projects) so the committed
JSON is fully reproducible:

    python scripts/generate_viz_data.py

Output: portfolio-site/src/data/viz/{fraud,telecom,sqlopt}.json

The numbers are synthetic and illustrative; the dashboards label them as such.
No third-party packages are required (no pyarrow / faker / pyyaml), so this runs
anywhere Python 3.11+ is available and keeps the site a pure static build.
"""

from __future__ import annotations

import json
import math
import random
import statistics
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

SEED = 42
OUT_DIR = Path(__file__).resolve().parent.parent / "src" / "data" / "viz"

GENERATED_AT = datetime(2026, 5, 30, tzinfo=timezone.utc)


def _meta(source: str, note: str) -> dict:
    return {
        "synthetic": True,
        "seed": SEED,
        "source": source,
        "note": note,
        "generated_by": "portfolio-site/scripts/generate_viz_data.py",
    }


# --------------------------------------------------------------------------- #
# Fraud  (mirrors project-fraud-signals/src/producer/generate.py)
# --------------------------------------------------------------------------- #

FRAUD_COUNTRIES = ["US", "CA", "GB", "DE", "FR", "ES", "IT", "AU", "BR", "JP", "ZA", "NG"]
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
FRAUD_PATTERNS = ["velocity_burst", "impossible_travel", "amount_outlier"]


def generate_fraud() -> dict:
    rng = random.Random(SEED)
    n_accounts = 200
    accounts = []
    for _ in range(n_accounts):
        mean = rng.uniform(20, 250)
        accounts.append(
            {
                "home_country": rng.choice(FRAUD_COUNTRIES),
                "mean": round(mean, 2),
                "std": round(mean * rng.uniform(0.2, 0.5), 2),
            }
        )

    n_events = 24_000
    # Per-decision fraud rate. Each fraud decision can emit several events
    # (velocity bursts emit 5-8), so the event-level fraud rate lands ~1.5-2%.
    fraud_rate = 0.006

    by_category: dict[str, dict[str, int]] = {
        c: {"total": 0, "fraud": 0} for c in MERCHANT_CATEGORIES
    }
    by_country: dict[str, dict[str, int]] = {
        c: {"total": 0, "fraud": 0} for c in FRAUD_COUNTRIES
    }
    patterns: dict[str, dict[str, float]] = {
        p: {"count": 0, "amount_sum": 0.0} for p in FRAUD_PATTERNS
    }
    # amount histogram buckets (USD)
    bucket_edges = [0, 25, 50, 100, 200, 400, 800, 1600, math.inf]
    bucket_labels = ["0-25", "25-50", "50-100", "100-200", "200-400", "400-800", "800-1600", "1600+"]
    hist_normal = [0] * len(bucket_labels)
    hist_fraud = [0] * len(bucket_labels)

    flagged_amount = 0.0
    fraud_count = 0

    def bucket_index(amount: float) -> int:
        for i in range(len(bucket_labels)):
            if bucket_edges[i] <= amount < bucket_edges[i + 1]:
                return i
        return len(bucket_labels) - 1

    def record(category: str, country: str, amount: float, is_fraud: bool) -> None:
        by_category[category]["total"] += 1
        by_country[country]["total"] += 1
        if is_fraud:
            by_category[category]["fraud"] += 1
            by_country[country]["fraud"] += 1
            hist_fraud[bucket_index(amount)] += 1
        else:
            hist_normal[bucket_index(amount)] += 1

    emitted = 0
    while emitted < n_events:
        acct = rng.choice(accounts)
        category = rng.choice(MERCHANT_CATEGORIES)
        if rng.random() < fraud_rate:
            pattern = rng.choice(FRAUD_PATTERNS)
            if pattern == "velocity_burst":
                burst = rng.randint(5, 8)
                for _ in range(burst):
                    amount = round(acct["mean"] * rng.uniform(3, 8), 2)
                    record(category, rng.choice(FRAUD_COUNTRIES), amount, True)
                    patterns[pattern]["count"] += 1
                    patterns[pattern]["amount_sum"] += amount
                    flagged_amount += amount
                    fraud_count += 1
                    emitted += 1
            elif pattern == "impossible_travel":
                for _ in range(2):
                    amount = round(max(1.0, rng.gauss(acct["mean"], acct["std"])), 2)
                    record(category, rng.choice(FRAUD_COUNTRIES), amount, True)
                    patterns[pattern]["count"] += 1
                    patterns[pattern]["amount_sum"] += amount
                    flagged_amount += amount
                    fraud_count += 1
                    emitted += 1
            else:  # amount_outlier
                amount = round(acct["mean"] + 6 * acct["std"], 2)
                record(category, acct["home_country"], amount, True)
                patterns[pattern]["count"] += 1
                patterns[pattern]["amount_sum"] += amount
                flagged_amount += amount
                fraud_count += 1
                emitted += 1
        else:
            amount = round(max(1.0, rng.gauss(acct["mean"], acct["std"])), 2)
            record(category, acct["home_country"], amount, False)
            emitted += 1

    total = emitted
    top_pattern = max(patterns.items(), key=lambda kv: kv[1]["count"])[0]

    # throughput timeseries: 90 seconds, ~50 events/sec with flagged overlay
    throughput = []
    t_rng = random.Random(SEED + 1)
    for sec in range(90):
        eps = max(0, int(t_rng.gauss(50, 8)))
        # ~2% of throughput is flagged so the overlay stays visible on the chart
        flagged = sum(1 for _ in range(eps) if t_rng.random() < 0.02)
        throughput.append({"t": sec, "events_per_sec": eps, "flagged_per_sec": flagged})

    return {
        "_meta": _meta(
            "project-fraud-signals/src/producer/generate.py",
            "Synthetic transaction stream with 5% seeded fraud across velocity, "
            "impossible-travel, and amount-outlier patterns.",
        ),
        "kpis": {
            "events_scored": total,
            "fraud_rate_pct": round(100 * fraud_count / total, 2),
            "flagged_amount_usd": round(flagged_amount, 2),
            "top_pattern": top_pattern,
        },
        "fraud_by_category": [
            {
                "category": c,
                "total": v["total"],
                "fraud": v["fraud"],
                "fraud_rate": round(100 * v["fraud"] / v["total"], 2) if v["total"] else 0,
            }
            for c, v in sorted(by_category.items(), key=lambda kv: -kv[1]["fraud"])
        ],
        "fraud_by_country": [
            {
                "country": c,
                "total": v["total"],
                "fraud": v["fraud"],
                "fraud_rate": round(100 * v["fraud"] / v["total"], 2) if v["total"] else 0,
            }
            for c, v in sorted(by_country.items(), key=lambda kv: -kv[1]["fraud"])
        ],
        "pattern_breakdown": [
            {
                "pattern": p,
                "count": int(v["count"]),
                "avg_amount": round(v["amount_sum"] / v["count"], 2) if v["count"] else 0,
            }
            for p, v in patterns.items()
        ],
        "amount_distribution": [
            {"bucket": bucket_labels[i], "normal": hist_normal[i], "fraud": hist_fraud[i]}
            for i in range(len(bucket_labels))
        ],
        "throughput": throughput,
    }


# --------------------------------------------------------------------------- #
# Telecom  (mirrors project-telecom-lakehouse/data_generator/generate_cdrs.py)
# --------------------------------------------------------------------------- #

MARKETS = ["NORTH", "SOUTH", "EAST", "WEST", "CENTRAL"]
PLANS = ["BASIC_5GB", "PRO_25GB", "UNLIMITED", "FAMILY_50GB", "PREPAID"]
CALL_TYPES = ["VOICE", "SMS", "DATA"]

PLAN_BASE_FEE = {
    "BASIC_5GB": 25.0,
    "PRO_25GB": 45.0,
    "UNLIMITED": 65.0,
    "FAMILY_50GB": 90.0,
    "PREPAID": 15.0,
}
PLAN_CHURN_RATE = {
    "BASIC_5GB": 2.1,
    "PRO_25GB": 1.4,
    "UNLIMITED": 0.9,
    "FAMILY_50GB": 0.7,
    "PREPAID": 4.8,
}


def generate_telecom() -> dict:
    rng = random.Random(SEED)
    n_rows = 50_000
    days = 365  # spread across a year so monthly ARPU has 12 buckets

    # subscriber base per market / plan (seeded, stable)
    subs_by_market = {m: rng.randint(9_000, 26_000) for m in MARKETS}
    subs_by_plan = {p: rng.randint(7_000, 30_000) for p in PLANS}
    total_subs = sum(subs_by_market.values())

    revenue_by_market = {m: 0.0 for m in MARKETS}
    calltype_by_market = {m: {"VOICE": 0, "SMS": 0, "DATA": 0} for m in MARKETS}
    revenue_by_month: dict[str, float] = defaultdict(float)
    # heatmap: weekday (0=Mon) x hour (0-23)
    heatmap = [[0 for _ in range(24)] for _ in range(7)]
    roaming_count = 0

    start = GENERATED_AT.replace(hour=0, minute=0, second=0, microsecond=0)

    for _ in range(n_rows):
        call_type = rng.choices(CALL_TYPES, weights=[0.4, 0.35, 0.25])[0]
        market = rng.choice(MARKETS)
        ts = start - timedelta(
            days=rng.randint(0, days - 1), seconds=rng.randint(0, 86_399)
        )
        is_roaming = rng.random() < 0.05
        if is_roaming:
            roaming_count += 1

        # rate the event
        if call_type == "VOICE":
            minutes = int(rng.expovariate(1 / 90)) / 60.0
            rated = minutes * 0.02
        elif call_type == "DATA":
            gb = rng.randint(1024, 50_000_000) / 1e9
            rated = gb * 5.0
        else:  # SMS
            rated = 0.01
        if is_roaming:
            rated *= 3.0

        revenue_by_market[market] += rated
        calltype_by_market[market][call_type] += 1
        revenue_by_month[ts.strftime("%Y-%m")] += rated
        heatmap[ts.weekday()][ts.hour] += 1

    # base subscription revenue makes ARPU realistic
    base_revenue = sum(subs_by_plan[p] * PLAN_BASE_FEE[p] for p in PLANS)
    usage_revenue = sum(revenue_by_market.values())
    total_revenue = base_revenue + usage_revenue
    arpu = total_revenue / total_subs

    # distribute base revenue across months evenly for the monthly ARPU line
    months = sorted(revenue_by_month.keys())[-12:]  # trailing 12 months
    base_per_month = base_revenue / max(len(months), 1)
    arpu_monthly = []
    for m in months:
        month_rev = revenue_by_month[m] + base_per_month
        arpu_monthly.append(
            {
                "month": m,
                "revenue": round(month_rev, 2),
                "arpu": round(month_rev / total_subs, 2),
            }
        )

    churn_weighted = sum(subs_by_plan[p] * PLAN_CHURN_RATE[p] for p in PLANS)
    churn_rate = churn_weighted / sum(subs_by_plan.values())

    days_labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    heatmap_data = [
        [h, d, heatmap[d][h]] for d in range(7) for h in range(24)
    ]  # [x=hour, y=weekday, value]

    return {
        "_meta": _meta(
            "project-telecom-lakehouse/data_generator/generate_cdrs.py",
            "50,000 synthetic CDRs across a year, rated into revenue/ARPU/churn marts.",
        ),
        "kpis": {
            "total_cdrs": n_rows,
            "revenue_usd": round(total_revenue, 2),
            "arpu_usd": round(arpu, 2),
            "churn_rate_pct": round(churn_rate, 2),
            "roaming_pct": round(100 * roaming_count / n_rows, 2),
        },
        "revenue_by_market": [
            {
                "market": m,
                "revenue": round(revenue_by_market[m] + base_revenue * subs_by_market[m] / total_subs, 2),
                "subscribers": subs_by_market[m],
            }
            for m in sorted(MARKETS, key=lambda x: -subs_by_market[x])
        ],
        "arpu_monthly": arpu_monthly,
        "calltype_by_market": [
            {
                "market": m,
                "voice": calltype_by_market[m]["VOICE"],
                "sms": calltype_by_market[m]["SMS"],
                "data": calltype_by_market[m]["DATA"],
            }
            for m in MARKETS
        ],
        "churn_signals": [
            {
                "plan_id": p,
                "churn_rate": PLAN_CHURN_RATE[p],
                "subscribers": subs_by_plan[p],
            }
            for p in sorted(PLANS, key=lambda x: -PLAN_CHURN_RATE[x])
        ],
        "usage_heatmap": {
            "days": days_labels,
            "hours": [f"{h:02d}" for h in range(24)],
            "data": heatmap_data,
            "max": max(max(row) for row in heatmap),
        },
    }


# --------------------------------------------------------------------------- #
# SQL optimizer  (mirrors project-ai-sql-optimizer/corpus + analyzer rules)
# --------------------------------------------------------------------------- #

SQLOPT_CATEGORIES = [
    "join_optimization",
    "aggregation_rewrite",
    "cte_flattening",
    "partition_pruning",
    "broadcast_join",
]
# realistic median cost-reduction band per category (%)
CATEGORY_BAND = {
    "join_optimization": (35, 75),
    "aggregation_rewrite": (20, 55),
    "cte_flattening": (15, 45),
    "partition_pruning": (50, 90),
    "broadcast_join": (40, 80),
}
ANALYZER_RULES = [
    ("select_star", "info"),
    ("cross_join", "high"),
    ("missing_partition_predicate", "high"),
    ("broadcast_opportunity", "warn"),
    ("deep_cte_nesting", "warn"),
    ("correlated_subquery", "warn"),
]


def generate_sqlopt() -> dict:
    rng = random.Random(SEED)
    corpus_size = 50

    cost_reduction = []
    for i in range(1, corpus_size + 1):
        category = SQLOPT_CATEGORIES[(i - 1) % len(SQLOPT_CATEGORIES)]
        lo, hi = CATEGORY_BAND[category]
        # ~10% of queries regress or barely move (the optimizer isn't perfect)
        if rng.random() < 0.1:
            reduction = round(rng.uniform(-8, 4), 1)
        else:
            reduction = round(rng.triangular(lo, hi, (lo + hi) / 2), 1)
        cost_before = rng.randint(2_000, 50_000)
        cost_after = round(cost_before * (1 - reduction / 100), 0)
        cost_reduction.append(
            {
                "query_id": f"{i:02d}",
                "category": category,
                "reduction_pct": reduction,
                "cost_before": cost_before,
                "cost_after": int(cost_after),
            }
        )

    reductions = [q["reduction_pct"] for q in cost_reduction]
    wins = sum(1 for r in reductions if r > 0)

    by_category = []
    for cat in SQLOPT_CATEGORIES:
        vals = [q["reduction_pct"] for q in cost_reduction if q["category"] == cat]
        by_category.append(
            {
                "category": cat,
                "count": len(vals),
                "median": round(statistics.median(vals), 1),
                "min": min(vals),
                "max": max(vals),
            }
        )

    # histogram of reductions
    edges = [0, 20, 30, 40, 50, 60, 70, 80, 100]
    labels = ["0-20", "20-30", "30-40", "40-50", "50-60", "60-70", "70-80", "80+"]
    hist = [0] * len(labels)
    for r in reductions:
        for j in range(len(labels)):
            if edges[j] <= r < edges[j + 1]:
                hist[j] += 1
                break

    # findings per rule (seeded counts across the corpus)
    findings = []
    f_rng = random.Random(SEED + 7)
    total_findings = 0
    for rule, severity in ANALYZER_RULES:
        count = f_rng.randint(6, 34)
        total_findings += count
        findings.append({"rule": rule, "count": count, "severity": severity})

    return {
        "_meta": _meta(
            "project-ai-sql-optimizer/corpus",
            "50-query corpus across 5 optimization categories; cost reductions and "
            "analyzer findings are seeded illustrative values.",
        ),
        "kpis": {
            "corpus_size": corpus_size,
            "median_cost_reduction_pct": round(statistics.median(reductions), 1),
            "win_rate_pct": round(100 * wins / corpus_size, 1),
            "avg_findings_per_query": round(total_findings / corpus_size, 2),
        },
        "cost_reduction": sorted(cost_reduction, key=lambda q: -q["reduction_pct"]),
        "by_category": by_category,
        "reduction_distribution": [
            {"bucket": labels[j], "count": hist[j]} for j in range(len(labels))
        ],
        "findings_by_rule": sorted(findings, key=lambda f: -f["count"]),
    }


# --------------------------------------------------------------------------- #

def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    datasets = {
        "fraud.json": generate_fraud(),
        "telecom.json": generate_telecom(),
        "sqlopt.json": generate_sqlopt(),
    }
    for name, data in datasets.items():
        path = OUT_DIR / name
        path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
        print(f"wrote {path}  ({path.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
