import type { JSX } from "react";
import EChart from "./EChart";
import KpiCard from "./KpiCard";
import DataTable from "./DataTable";
import {
  axisLabel,
  axisLine,
  grid,
  legend,
  splitLine,
  tooltip,
  usd,
  type VizTokens,
} from "./theme";
import fraud from "../../data/viz/fraud.json";

const PATTERN_LABELS: Record<string, string> = {
  velocity_burst: "Velocity burst",
  impossible_travel: "Impossible travel",
  amount_outlier: "Amount outlier",
};

// --- option builders (module scope => stable identity) --------------------

function categoryOption(t: VizTokens) {
  const rows = fraud.fraud_by_category;
  return {
    grid: grid({ right: 24 }),
    tooltip: tooltip(t, {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      formatter: (p: any) => {
        const r = rows[p[0].dataIndex];
        return `<b>${r.category}</b><br/>Fraud rate: ${r.fraud_rate}%<br/>${r.fraud.toLocaleString()} / ${r.total.toLocaleString()} txns`;
      },
    }),
    xAxis: {
      type: "value",
      name: "fraud %",
      nameTextStyle: { color: t.muted, fontSize: 10 },
      axisLabel: axisLabel(t),
      axisLine: axisLine(t),
      splitLine: splitLine(t),
    },
    yAxis: {
      type: "category",
      inverse: true,
      data: rows.map((r) => r.category),
      axisLabel: axisLabel(t),
      axisLine: axisLine(t),
    },
    series: [
      {
        type: "bar",
        data: rows.map((r) => r.fraud_rate),
        itemStyle: { color: t.accent, borderRadius: [0, 3, 3, 0] },
        barWidth: "58%",
      },
    ],
  };
}

function countryOption(t: VizTokens) {
  return {
    tooltip: tooltip(t, {
      formatter: (p: any) => `<b>${p.name}</b><br/>${p.value.toLocaleString()} fraud events`,
    }),
    series: [
      {
        type: "treemap",
        roam: false,
        nodeClick: false,
        breadcrumb: { show: false },
        label: { color: "#fff", fontSize: 12 },
        itemStyle: { borderColor: t.tooltipBg, borderWidth: 2, gapWidth: 2 },
        levels: [{ color: t.series }],
        data: fraud.fraud_by_country.map((r) => ({ name: r.country, value: r.fraud })),
      },
    ],
  };
}

function patternOption(t: VizTokens) {
  return {
    tooltip: tooltip(t, { trigger: "item" }),
    legend: legend(t, { bottom: 0, icon: "circle" }),
    series: [
      {
        type: "pie",
        radius: ["45%", "72%"],
        center: ["50%", "44%"],
        avoidLabelOverlap: true,
        itemStyle: { borderColor: t.tooltipBg, borderWidth: 2 },
        label: { color: t.fg, fontSize: 11 },
        data: fraud.pattern_breakdown.map((p, i) => ({
          name: PATTERN_LABELS[p.pattern] ?? p.pattern,
          value: p.count,
          itemStyle: { color: t.series[i % t.series.length] },
        })),
      },
    ],
  };
}

function amountOption(t: VizTokens) {
  const rows = fraud.amount_distribution;
  return {
    grid: grid({ bottom: 36 }),
    tooltip: tooltip(t, { trigger: "axis", axisPointer: { type: "shadow" } }),
    legend: legend(t, { top: 0, data: ["Legit", "Fraud"] }),
    xAxis: {
      type: "category",
      data: rows.map((r) => r.bucket),
      axisLabel: { ...axisLabel(t), rotate: 30 },
      axisLine: axisLine(t),
    },
    yAxis: {
      type: "log",
      axisLabel: axisLabel(t),
      axisLine: axisLine(t),
      splitLine: splitLine(t),
    },
    series: [
      {
        name: "Legit",
        type: "bar",
        stack: "amt",
        data: rows.map((r) => r.normal || 0),
        itemStyle: { color: t.series[5] },
      },
      {
        name: "Fraud",
        type: "bar",
        stack: "amt",
        data: rows.map((r) => r.fraud || 0),
        itemStyle: { color: "#ef4444" },
      },
    ],
  };
}

function throughputOption(t: VizTokens) {
  const rows = fraud.throughput;
  const avg = rows.reduce((s, r) => s + r.events_per_sec, 0) / rows.length;
  return {
    grid: grid({ bottom: 28 }),
    tooltip: tooltip(t, { trigger: "axis" }),
    legend: legend(t, { top: 0, data: ["Events/sec", "Flagged/sec"] }),
    xAxis: {
      type: "category",
      data: rows.map((r) => r.t),
      name: "seconds",
      nameTextStyle: { color: t.muted, fontSize: 10 },
      axisLabel: axisLabel(t),
      axisLine: axisLine(t),
    },
    yAxis: {
      type: "value",
      axisLabel: axisLabel(t),
      axisLine: axisLine(t),
      splitLine: splitLine(t),
    },
    series: [
      {
        name: "Events/sec",
        type: "line",
        smooth: true,
        symbol: "none",
        areaStyle: { opacity: 0.18, color: t.accent },
        lineStyle: { color: t.accent, width: 2 },
        data: rows.map((r) => r.events_per_sec),
        markLine: {
          silent: true,
          symbol: "none",
          lineStyle: { color: t.muted, type: "dashed" },
          label: { color: t.muted, formatter: `avg ${avg.toFixed(0)}/s` },
          data: [{ yAxis: Math.round(avg) }],
        },
      },
      {
        name: "Flagged/sec",
        type: "line",
        smooth: true,
        symbol: "none",
        lineStyle: { color: "#ef4444", width: 2 },
        data: rows.map((r) => r.flagged_per_sec),
      },
    ],
  };
}

// --------------------------------------------------------------------------

export default function FraudDashboard(): JSX.Element {
  const k = fraud.kpis;
  return (
    <div>
      <div className="placeholder-banner mb-4">
        Synthetic, seeded data generated from the fraud-signals event producer
        (24,000 transactions, ~2% fraud). Numbers are illustrative.
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Events scored" value={k.events_scored.toLocaleString()} />
        <KpiCard label="Fraud rate" value={`${k.fraud_rate_pct}%`} accent="#ef4444" />
        <KpiCard label="Flagged amount" value={usd(k.flagged_amount_usd)} accent="#f59e0b" />
        <KpiCard
          label="Top pattern"
          value={PATTERN_LABELS[k.top_pattern] ?? k.top_pattern}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <figure className="demo-card">
          <figcaption className="mb-2 text-sm font-semibold">Fraud rate by merchant category</figcaption>
          <EChart
            height={300}
            ariaLabel="Fraud rate by merchant category"
            buildOption={categoryOption}
            fallbackTable={
              <DataTable
                caption="Fraud rate by merchant category"
                columns={["Category", "Fraud rate %", "Fraud", "Total"]}
                rows={fraud.fraud_by_category.map((r) => [r.category, r.fraud_rate, r.fraud, r.total])}
              />
            }
          />
        </figure>

        <figure className="demo-card">
          <figcaption className="mb-2 text-sm font-semibold">Fraud events by country</figcaption>
          <EChart
            height={300}
            ariaLabel="Fraud events by country (treemap)"
            buildOption={countryOption}
            fallbackTable={
              <DataTable
                caption="Fraud events by country"
                columns={["Country", "Fraud events"]}
                rows={fraud.fraud_by_country.map((r) => [r.country, r.fraud])}
              />
            }
          />
        </figure>

        <figure className="demo-card">
          <figcaption className="mb-2 text-sm font-semibold">Detected pattern mix</figcaption>
          <EChart
            height={300}
            ariaLabel="Detected fraud pattern mix"
            buildOption={patternOption}
            fallbackTable={
              <DataTable
                caption="Detected pattern mix"
                columns={["Pattern", "Count", "Avg amount"]}
                rows={fraud.pattern_breakdown.map((p) => [p.pattern, p.count, p.avg_amount])}
              />
            }
          />
        </figure>

        <figure className="demo-card">
          <figcaption className="mb-2 text-sm font-semibold">Amount distribution (log scale)</figcaption>
          <EChart
            height={300}
            ariaLabel="Transaction amount distribution, legit versus fraud"
            buildOption={amountOption}
            fallbackTable={
              <DataTable
                caption="Amount distribution"
                columns={["Bucket (USD)", "Legit", "Fraud"]}
                rows={fraud.amount_distribution.map((r) => [r.bucket, r.normal, r.fraud])}
              />
            }
          />
        </figure>
      </div>

      <figure className="demo-card mt-4">
        <figcaption className="mb-2 text-sm font-semibold">Streaming throughput &amp; flagged events</figcaption>
        <EChart
          height={280}
          ariaLabel="Streaming throughput and flagged events per second"
          buildOption={throughputOption}
          fallbackTable={
            <DataTable
              caption="Throughput per second"
              columns={["Second", "Events/sec", "Flagged/sec"]}
              rows={fraud.throughput.map((r) => [r.t, r.events_per_sec, r.flagged_per_sec])}
            />
          }
        />
      </figure>
    </div>
  );
}
