#!/usr/bin/env python3
"""Telecom scenario data for the /visualizations dashboard.

The telecom project's own demo covers three days of a 1,200-subscriber pool,
which is too short to show trends, seasonality or churn over time. This script
simulates a labelled, documented *scenario* in the same domain — and keeps
every rule identical to the project's dbt models, so the dashboard reads like
the Gold marts would on a year of real traffic:

* pricing        = dbt_telecom/models/silver/sl_revenue_event.sql
                   VOICE ceil(sec/60) * $0.05, DATA MB * $0.02, SMS $0.01
* monthly ARPU   = dbt_telecom/models/gold/arpu_monthly.sql
                   average revenue per caller active in the month
* churn risk     = dbt_telecom/models/gold/churn_signals.sql
                   events in the last 30 days: <=1 high, <=5 medium, else low
* markets/plans  = data_generator/generate_cdrs.py

Everything is seeded (42) and stdlib-only. ``--check`` regenerates in memory
and fails if src/data/viz/telecom.json differs; internal consistency checks
(totals reconcile, KPI == mean of the series, heatmap == event count) run on
every invocation.

    python3 scripts/generate_viz_data.py [--check]

The fraud and SQL dashboards no longer use generated data: they read the real
artifacts exported by scripts/artifacts/{fraud,sqlopt}.py.
"""

from __future__ import annotations

import json
import math
import random
import sys
from datetime import date, timedelta
from pathlib import Path

SEED = 42
OUT = Path(__file__).resolve().parent.parent / "src" / "data" / "viz" / "telecom.json"

MARKETS = ["NORTH", "SOUTH", "EAST", "WEST", "CENTRAL"]
MARKET_WEIGHT = [0.18, 0.20, 0.24, 0.22, 0.16]
PLANS = ["BASIC_5GB", "PRO_25GB", "UNLIMITED", "FAMILY_50GB", "PREPAID"]
PLAN_WEIGHT = [0.26, 0.20, 0.18, 0.16, 0.20]
# events per active day, and call-type mix (voice, sms, data), by plan
PLAN_RATE = {"BASIC_5GB": 1.0, "PRO_25GB": 1.4, "UNLIMITED": 2.0, "FAMILY_50GB": 1.7, "PREPAID": 0.7}
PLAN_MIX = {
    "BASIC_5GB": (0.45, 0.35, 0.20),
    "PRO_25GB": (0.35, 0.25, 0.40),
    "UNLIMITED": (0.25, 0.20, 0.55),
    "FAMILY_50GB": (0.35, 0.30, 0.35),
    "PREPAID": (0.50, 0.40, 0.10),
}
# probability a subscriber churns at some point during the year, by plan
PLAN_CHURN = {"BASIC_5GB": 0.18, "PRO_25GB": 0.10, "UNLIMITED": 0.08, "FAMILY_50GB": 0.06, "PREPAID": 0.35}
CALL_TYPES = ["VOICE", "SMS", "DATA"]

# Diurnal profile (relative events per hour, 00..23): quiet overnight, a
# morning ramp, a lunchtime shoulder and an evening busy hour.
HOURLY = [0.6, 0.35, 0.25, 0.2, 0.25, 0.45, 0.9, 1.6, 2.2, 2.4, 2.5, 2.6,
          2.8, 2.7, 2.5, 2.5, 2.6, 2.9, 3.3, 3.5, 3.2, 2.6, 1.8, 1.1]
# Day-of-week factor (Mon..Sun): business days busier, Sunday quietest.
WEEKDAY = [1.05, 1.05, 1.05, 1.05, 1.1, 0.88, 0.78]
DATA_GROWTH_PER_MONTH = 0.015  # data sessions grow ~1.5% a month
DECEMBER_LIFT = 0.10
WIND_DOWN_DAYS = 45  # activity fades over the 45 days before a subscriber churns

N_SUBS = 1_200
START = date(2025, 10, 1)
DAYS = 365


def poisson(rng: random.Random, lam: float) -> int:
    """Knuth's method — fine for the small rates used here."""
    l, k, p = math.exp(-lam), 0, 1.0
    while True:
        p *= rng.random()
        if p <= l:
            return k
        k += 1


def price(call_type: str, duration_sec: int, mb: float) -> float:
    if call_type == "VOICE":
        return math.ceil(duration_sec / 60.0) * 0.05
    if call_type == "DATA":
        return mb * 0.02
    return 0.01


def generate() -> dict:
    rng = random.Random(SEED)
    hour_cum = []
    acc = 0.0
    for w in HOURLY:
        acc += w
        hour_cum.append(acc)

    subs = []
    for i in range(N_SUBS):
        plan = rng.choices(PLANS, weights=PLAN_WEIGHT)[0]
        market = rng.choices(MARKETS, weights=MARKET_WEIGHT)[0]
        join_day = 0 if rng.random() < 0.85 else rng.randint(1, DAYS - 1)
        # Churn dates may fall after the window: those subscribers are still
        # active at year end but already winding down — the early-warning case.
        churn_day = rng.randint(join_day + 30, DAYS + 60) if rng.random() < PLAN_CHURN[plan] else None
        subs.append({"id": i, "plan": plan, "market": market, "join": join_day,
                     "churn": churn_day, "rate": PLAN_RATE[plan] * rng.uniform(0.6, 1.4)})

    months = [(START + timedelta(days=d)).strftime("%Y-%m") for d in range(DAYS)]
    month_keys = sorted(set(months))
    scopes = ["ALL", *MARKETS]

    def empty_scope():
        return {
            "rev_month": {m: 0.0 for m in month_keys},
            "events_month": {m: 0 for m in month_keys},
            "active_month": {m: set() for m in month_keys},
            "rev_type": {t: 0.0 for t in CALL_TYPES},
            "count_type": {t: 0 for t in CALL_TYPES},
            "heat": [[0] * 24 for _ in range(7)],
            "last30": {},
            "events": 0,
            "roaming": 0,
        }

    agg = {s: empty_scope() for s in scopes}
    last30_start = DAYS - 30

    for s in subs:
        end = min(s["churn"], DAYS) if s["churn"] is not None else DAYS
        mix = PLAN_MIX[s["plan"]]
        for d in range(s["join"], end):
            day = START + timedelta(days=d)
            month = months[d]
            seasonal = 1.0 + (DECEMBER_LIFT if day.month == 12 else 0.0)
            lam = s["rate"] * WEEKDAY[day.weekday()] * seasonal
            if s["churn"] is not None and d >= s["churn"] - WIND_DOWN_DAYS:
                lam *= max(0.03, (s["churn"] - d) / WIND_DOWN_DAYS) ** 2
            n = poisson(rng, lam)
            for _ in range(n):
                growth = 1.0 + DATA_GROWTH_PER_MONTH * month_keys.index(month)
                w = (mix[0], mix[1], mix[2] * growth)
                ct = rng.choices(CALL_TYPES, weights=w)[0]
                duration = int(rng.expovariate(1 / 150)) if ct == "VOICE" else 0
                mb = round(math.exp(rng.gauss(math.log(40), 0.9)), 3) if ct == "DATA" else 0.0
                rev = price(ct, duration, mb)
                hour = rng.choices(range(24), cum_weights=hour_cum)[0]
                roaming = rng.random() < 0.04
                for scope in ("ALL", s["market"]):
                    a = agg[scope]
                    a["rev_month"][month] += rev
                    a["events_month"][month] += 1
                    a["active_month"][month].add(s["id"])
                    a["rev_type"][ct] += rev
                    a["count_type"][ct] += 1
                    a["heat"][day.weekday()][hour] += 1
                    a["events"] += 1
                    a["roaming"] += roaming
                    if d >= last30_start:
                        a["last30"][s["id"]] = a["last30"].get(s["id"], 0) + 1

    def risk(n: int) -> str:
        return "high" if n <= 1 else "medium" if n <= 5 else "low"

    out_scopes = {}
    for scope in scopes:
        a = agg[scope]
        members = [s for s in subs if scope == "ALL" or s["market"] == scope]
        monthly = []
        for m in month_keys:
            active = len(a["active_month"][m])
            rev = a["rev_month"][m]
            monthly.append({
                "month": m,
                "revenue": round(rev, 2),
                "activeCallers": active,
                "arpu": round(rev / active, 4) if active else 0.0,
                "events": a["events_month"][m],
            })
        churn = {p: {"high": 0, "medium": 0, "low": 0} for p in PLANS}
        for s in members:
            if s["join"] > last30_start:
                continue  # too new to classify
            churn[s["plan"]][risk(a["last30"].get(s["id"], 0))] += 1
        churned = sum(1 for s in members if s["churn"] is not None and s["churn"] < DAYS)
        out_scopes[scope] = {
            "subscribers": len(members),
            "churned": churned,
            "events": a["events"],
            "roamingShare": round(a["roaming"] / a["events"], 4) if a["events"] else 0,
            "revenue": round(sum(a["rev_month"].values()), 2),
            "arpuMonthlyMean": round(sum(r["arpu"] for r in monthly) / len(monthly), 4),
            "monthly": monthly,
            "revenueByType": {t: round(v, 2) for t, v in a["rev_type"].items()},
            "countByType": a["count_type"],
            "heatmap": a["heat"],
            "churnRiskByPlan": churn,
        }

    doc = {
        "_meta": {
            "synthetic": True,
            "scenario": True,
            "seed": SEED,
            "generatedBy": "portfolio-site/scripts/generate_viz_data.py",
            "note": (
                "Scenario data, not make demo output: a year of simulated traffic for "
                f"{N_SUBS:,} subscribers, priced and aggregated with the project's own dbt rules."
            ),
            "assumptions": [
                "Pricing, monthly ARPU and churn-risk thresholds match the dbt models exactly.",
                "Usage revenue only — no plan fees, as in sl_revenue_event.",
                "Diurnal profile: quiet 01:00–05:00, morning ramp, evening busy hour around 19:00.",
                "Weekdays run ~5% above average; Saturday −12%, Sunday −22%.",
                "Data sessions grow ~1.5% a month; December carries a 10% seasonal lift.",
                "15% of subscribers join mid-year; churn probability per plan ranges 6% (family) to 35% (prepaid).",
                "Activity fades over the 45 days before churn, so the churn mart can flag subscribers early.",
            ],
            "start": START.isoformat(),
            "days": DAYS,
        },
        "markets": MARKETS,
        "plans": PLANS,
        "months": month_keys,
        "scopes": out_scopes,
    }
    self_check(doc)
    return doc


def self_check(doc: dict) -> None:
    all_ = doc["scopes"]["ALL"]
    markets = [doc["scopes"][m] for m in doc["markets"]]
    tol = 0.05
    assert abs(sum(m["revenue"] for m in markets) - all_["revenue"]) < tol, "market revenue != total"
    assert sum(m["events"] for m in markets) == all_["events"], "market events != total"
    assert sum(m["subscribers"] for m in markets) == all_["subscribers"], "market subs != total"
    for scope in doc["scopes"].values():
        assert abs(sum(r["revenue"] for r in scope["monthly"]) - scope["revenue"]) < tol, "monthly != total"
        assert sum(map(sum, scope["heatmap"])) == scope["events"], "heatmap != events"
        assert abs(sum(scope["revenueByType"].values()) - scope["revenue"]) < tol, "by type != total"
        mean = sum(r["arpu"] for r in scope["monthly"]) / len(scope["monthly"])
        assert abs(mean - scope["arpuMonthlyMean"]) < 1e-3, "KPI ARPU != mean of series"


def main() -> int:
    doc = generate()
    text = json.dumps(doc, indent=1, ensure_ascii=False) + "\n"
    if "--check" in sys.argv:
        current = OUT.read_text(encoding="utf-8") if OUT.exists() else ""
        if current != text:
            print(f"DRIFT {OUT}", file=sys.stderr)
            return 1
        print(f"ok    {OUT.name} (self-checks passed)", file=sys.stderr)
        return 0
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(text, encoding="utf-8")
    a = doc["scopes"]["ALL"]
    print(f"wrote {OUT.name}: {a['events']:,} events, ${a['revenue']:,.0f} revenue, "
          f"mean monthly ARPU ${a['arpuMonthlyMean']:.2f}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
