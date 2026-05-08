"""Streamlit dashboard for fraud-signal events.

Reads from the Delta table written by the streaming consumer when available,
otherwise falls back to a local JSONL file produced by `producer.generate`.
Run with::

    make run-dashboard
"""

from __future__ import annotations

import json
from pathlib import Path

import pandas as pd
import streamlit as st

from anomaly.detect import detect_all

st.set_page_config(page_title="Fraud Signals", layout="wide")
st.title("Real-Time Fraud Signals")

DELTA_PATH = Path("data/delta/tx_events")
JSONL_PATH = Path("data/events.jsonl")


@st.cache_data(ttl=10)
def load_events() -> pd.DataFrame:
    if DELTA_PATH.exists():
        try:
            import pyarrow.dataset as ds

            dataset = ds.dataset(str(DELTA_PATH), format="parquet")
            return dataset.to_table().to_pandas()
        except Exception as e:
            st.warning(f"Delta read failed, falling back to JSONL ({e})")
    if JSONL_PATH.exists():
        rows = [json.loads(line) for line in JSONL_PATH.read_text().splitlines() if line.strip()]
        return pd.DataFrame(rows)
    return pd.DataFrame()


events = load_events()

if events.empty:
    st.info("No events found yet. Run `make run-producer` (or `make demo`) first.")
    st.stop()

events["ts"] = pd.to_datetime(events["ts"])
events = events.sort_values("ts")

col1, col2, col3, col4 = st.columns(4)
col1.metric("Events", f"{len(events):,}")
col2.metric("Distinct accounts", f"{events['account_id'].nunique():,}")
duration = (events["ts"].max() - events["ts"].min()).total_seconds() or 1
col3.metric("Events / sec (sampled)", f"{len(events) / duration:.1f}")
col4.metric("Mean amount", f"${events['amount'].mean():.2f}")

anomalies = detect_all(events.to_dict(orient="records"))
anom_df = pd.DataFrame(
    [
        {
            "account_id": a.account_id,
            "kind": a.kind,
            "score": a.score,
            "detail": a.detail,
        }
        for a in anomalies
    ]
)

left, right = st.columns([2, 1])
with left:
    st.subheader("Events over time")
    bucketed = (
        events.set_index("ts")["amount"]
        .resample("5s")
        .agg(["count", "sum"])
        .reset_index()
    )
    st.line_chart(bucketed, x="ts", y="count")
with right:
    st.subheader("Anomalies by kind")
    if anom_df.empty:
        st.write("None detected.")
    else:
        st.bar_chart(anom_df["kind"].value_counts())

st.subheader("Top accounts by anomaly score")
if anom_df.empty:
    st.write("None detected.")
else:
    top = (
        anom_df.groupby("account_id")["score"].sum().sort_values(ascending=False).head(20)
    )
    st.dataframe(top.rename("total_score"))

st.subheader("Country distribution")
if "country" in events.columns:
    counts = events["country"].value_counts().head(20)
    st.bar_chart(counts)
