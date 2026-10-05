import type { JSX } from "react";
import EChart from "../viz/EChart";
import ChartCard from "../viz/ChartCard";
import { axisLabel, barStyle, grid, legend, motion, splitLine, tooltip, usd, type VizMode, type VizTokens } from "../viz/theme";
import { samples } from "../../data/artifacts";

/**
 * Real Gold mart output from `make demo`: daily revenue by market across the
 * three generated day partitions, rated with the Silver pricing rules.
 */
const ROWS = samples.gold.revenueByMarket;
const MARKETS = [...new Set(ROWS.map((r) => r.market))];
const DAYS = [...new Set(ROWS.map((r) => r.day))];
const totals = MARKETS.map((m) => ({ m, v: ROWS.filter((r) => r.market === m).reduce((a, r) => a + r.revenueUsd, 0) }));
const lo = totals.reduce((a, b) => (b.v < a.v ? b : a));
const hi = totals.reduce((a, b) => (b.v > a.v ? b : a));

function buildOption(t: VizTokens, _m: VizMode, reduced: boolean) {
  return {
    ...motion(reduced),
    grid: grid({ top: 40 }),
    legend: legend(t, { top: 0, left: 0 }),
    tooltip: tooltip(t, { trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: (v: unknown) => usd(Number(v)) }),
    xAxis: { type: "category", data: MARKETS, axisLabel: axisLabel(t, { color: t.fg }), axisLine: { lineStyle: { color: t.border } }, axisTick: { show: false } },
    yAxis: { type: "value", axisLabel: axisLabel(t, { formatter: (v: number) => `$${v}` }), splitLine: splitLine(t) },
    series: DAYS.map((d, i) => ({
      name: `Day ${d.slice(1)}`,
      type: "bar",
      barGap: "12%",
      data: MARKETS.map((m) => ROWS.find((r) => r.market === m && r.day === d)?.revenueUsd ?? 0),
      ...barStyle(t.series[i]),
      emphasis: { focus: "series" },
    })),
  };
}

export default function GoldRevenueChart(): JSX.Element {
  return (
    <ChartCard
      id="gold-revenue"
      title="Gold output: daily revenue by market"
      subtitle="gold/revenue_by_market from make demo — 5 markets × 3 day partitions."
      provenance={{ label: "Real make demo output", title: samples._meta.note, kind: "real" }}
      takeaway={
        <>
          Totals range only from {usd(lo.v)} ({lo.m}) to {usd(hi.v)} ({hi.m}) over three days: the generator assigns
          markets uniformly, so the flat shape is a property of the synthetic data, not an insight.
        </>
      }
      table={{
        caption: "Daily revenue by market (USD)",
        columns: ["Market", ...DAYS.map((d) => `Day ${d.slice(1)}`), "Events (3 days)"],
        rows: MARKETS.map((m) => [
          m,
          ...DAYS.map((d) => (ROWS.find((r) => r.market === m && r.day === d)?.revenueUsd ?? 0).toFixed(2)),
          ROWS.filter((r) => r.market === m).reduce((a, r) => a + r.events, 0),
        ]),
      }}
      height={260}
      renderChart={(h) => (
        <EChart buildOption={buildOption} height={h} ariaLabel={`Grouped bars of daily revenue for ${MARKETS.length} markets across ${DAYS.length} days; totals between ${usd(lo.v)} and ${usd(hi.v)}.`} />
      )}
    />
  );
}
