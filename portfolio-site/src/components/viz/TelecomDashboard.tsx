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
import telecom from "../../data/viz/telecom.json";

// --- option builders (module scope => stable identity) --------------------

function revenueOption(t: VizTokens) {
  const rows = telecom.revenue_by_market;
  return {
    grid: grid({ right: 48, bottom: 24 }),
    tooltip: tooltip(t, { trigger: "axis", axisPointer: { type: "shadow" } }),
    legend: legend(t, { top: 0, data: ["Revenue", "Subscribers"] }),
    xAxis: {
      type: "category",
      data: rows.map((r) => r.market),
      axisLabel: axisLabel(t),
      axisLine: axisLine(t),
    },
    yAxis: [
      {
        type: "value",
        name: "USD",
        nameTextStyle: { color: t.muted, fontSize: 10 },
        axisLabel: { ...axisLabel(t), formatter: (v: number) => usd(v) },
        axisLine: axisLine(t),
        splitLine: splitLine(t),
      },
      {
        type: "value",
        name: "subs",
        nameTextStyle: { color: t.muted, fontSize: 10 },
        axisLabel: { ...axisLabel(t), formatter: (v: number) => `${(v / 1000).toFixed(0)}k` },
        axisLine: axisLine(t),
        splitLine: { show: false },
      },
    ],
    series: [
      {
        name: "Revenue",
        type: "bar",
        data: rows.map((r) => r.revenue),
        itemStyle: { color: t.accent, borderRadius: [3, 3, 0, 0] },
        barWidth: "48%",
      },
      {
        name: "Subscribers",
        type: "line",
        yAxisIndex: 1,
        smooth: true,
        symbolSize: 7,
        lineStyle: { color: t.series[1], width: 2 },
        itemStyle: { color: t.series[1] },
        data: rows.map((r) => r.subscribers),
      },
    ],
  };
}

function arpuOption(t: VizTokens) {
  const rows = telecom.arpu_monthly;
  return {
    grid: grid({ bottom: 48 }),
    tooltip: tooltip(t, { trigger: "axis" }),
    xAxis: {
      type: "category",
      data: rows.map((r) => r.month),
      axisLabel: { ...axisLabel(t), rotate: 40 },
      axisLine: axisLine(t),
    },
    yAxis: {
      type: "value",
      scale: true,
      name: "ARPU $",
      nameTextStyle: { color: t.muted, fontSize: 10 },
      axisLabel: axisLabel(t),
      axisLine: axisLine(t),
      splitLine: splitLine(t),
    },
    dataZoom: [
      { type: "inside" },
      { type: "slider", height: 16, bottom: 4, borderColor: t.border, textStyle: { color: t.muted } },
    ],
    series: [
      {
        name: "ARPU",
        type: "line",
        smooth: true,
        symbol: "circle",
        symbolSize: 6,
        lineStyle: { color: t.accent, width: 2.5 },
        itemStyle: { color: t.accent },
        areaStyle: { opacity: 0.15, color: t.accent },
        data: rows.map((r) => r.arpu),
      },
    ],
  };
}

function calltypeOption(t: VizTokens) {
  const rows = telecom.calltype_by_market;
  const mk = (key: "voice" | "sms" | "data", name: string, color: string) => ({
    name,
    type: "bar" as const,
    stack: "calls",
    emphasis: { focus: "series" as const },
    itemStyle: { color },
    data: rows.map((r) => r[key]),
  });
  return {
    grid: grid({ bottom: 24 }),
    tooltip: tooltip(t, { trigger: "axis", axisPointer: { type: "shadow" } }),
    legend: legend(t, { top: 0, data: ["Voice", "SMS", "Data"] }),
    xAxis: {
      type: "category",
      data: rows.map((r) => r.market),
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
      mk("voice", "Voice", t.series[0]),
      mk("sms", "SMS", t.series[1]),
      mk("data", "Data", t.series[3]),
    ],
  };
}

function heatmapOption(t: VizTokens) {
  const h = telecom.usage_heatmap;
  return {
    grid: { left: 40, right: 12, top: 16, bottom: 56 },
    tooltip: tooltip(t, {
      formatter: (p: any) =>
        `${h.days[p.value[1]]} ${h.hours[p.value[0]]}:00<br/>${p.value[2].toLocaleString()} calls`,
    }),
    xAxis: {
      type: "category",
      data: h.hours,
      splitArea: { show: true },
      axisLabel: { ...axisLabel(t), interval: 2 },
      axisLine: axisLine(t),
    },
    yAxis: {
      type: "category",
      data: h.days,
      splitArea: { show: true },
      axisLabel: axisLabel(t),
      axisLine: axisLine(t),
    },
    visualMap: {
      min: 0,
      max: h.max,
      calculable: true,
      orient: "horizontal",
      left: "center",
      bottom: 4,
      textStyle: { color: t.muted, fontSize: 10 },
      inRange: { color: ["rgba(37,99,235,0.08)", "#2563eb", "#1e3a8a"] },
    },
    series: [
      {
        type: "heatmap",
        data: h.data,
        emphasis: { itemStyle: { borderColor: t.fg, borderWidth: 1 } },
        progressive: 0,
      },
    ],
  };
}

function churnOption(t: VizTokens) {
  const rows = telecom.churn_signals;
  return {
    grid: grid({ right: 24 }),
    tooltip: tooltip(t, {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      formatter: (p: any) => {
        const r = rows[p[0].dataIndex];
        return `<b>${r.plan_id}</b><br/>Churn: ${r.churn_rate}%<br/>${r.subscribers.toLocaleString()} subscribers`;
      },
    }),
    xAxis: {
      type: "value",
      name: "churn %",
      nameTextStyle: { color: t.muted, fontSize: 10 },
      axisLabel: axisLabel(t),
      axisLine: axisLine(t),
      splitLine: splitLine(t),
    },
    yAxis: {
      type: "category",
      inverse: true,
      data: rows.map((r) => r.plan_id),
      axisLabel: axisLabel(t),
      axisLine: axisLine(t),
    },
    series: [
      {
        type: "bar",
        data: rows.map((r) => ({
          value: r.churn_rate,
          itemStyle: {
            color: r.churn_rate >= 3 ? "#ef4444" : r.churn_rate >= 1.5 ? "#f59e0b" : t.series[1],
            borderRadius: [0, 3, 3, 0],
          },
        })),
        barWidth: "58%",
      },
    ],
  };
}

// --------------------------------------------------------------------------

export default function TelecomDashboard(): JSX.Element {
  const k = telecom.kpis;
  return (
    <div>
      <div className="mb-4">
        <span
          className="data-chip"
          title="Synthetic, seeded data generated from the telecom CDR generator (50,000 rated call records across 12 months). Numbers are illustrative."
        >
          Synthetic demo data · seed 42
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Annual revenue" value={usd(k.revenue_usd)} accent="#2563eb" />
        <KpiCard label="ARPU" value={`$${k.arpu_usd}`} accent="#10b981" />
        <KpiCard label="Churn rate" value={`${k.churn_rate_pct}%`} accent="#f59e0b" />
        <KpiCard label="Roaming share" value={`${k.roaming_pct}%`} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <figure className="demo-card">
          <figcaption className="mb-2 text-sm font-semibold">Revenue &amp; subscribers by market</figcaption>
          <EChart
            height={300}
            ariaLabel="Revenue and subscribers by market"
            buildOption={revenueOption}
            fallbackTable={
              <DataTable
                caption="Revenue and subscribers by market"
                columns={["Market", "Revenue USD", "Subscribers"]}
                rows={telecom.revenue_by_market.map((r) => [r.market, r.revenue, r.subscribers])}
              />
            }
          />
        </figure>

        <figure className="demo-card">
          <figcaption className="mb-2 text-sm font-semibold">ARPU trend (12 months)</figcaption>
          <EChart
            height={300}
            ariaLabel="Average revenue per user over twelve months"
            buildOption={arpuOption}
            fallbackTable={
              <DataTable
                caption="Monthly ARPU"
                columns={["Month", "ARPU USD", "Revenue USD"]}
                rows={telecom.arpu_monthly.map((r) => [r.month, r.arpu, r.revenue])}
              />
            }
          />
        </figure>

        <figure className="demo-card">
          <figcaption className="mb-2 text-sm font-semibold">Call-type mix by market</figcaption>
          <EChart
            height={300}
            ariaLabel="Call type mix by market"
            buildOption={calltypeOption}
            fallbackTable={
              <DataTable
                caption="Call-type mix by market"
                columns={["Market", "Voice", "SMS", "Data"]}
                rows={telecom.calltype_by_market.map((r) => [r.market, r.voice, r.sms, r.data])}
              />
            }
          />
        </figure>

        <figure className="demo-card">
          <figcaption className="mb-2 text-sm font-semibold">Churn rate by plan</figcaption>
          <EChart
            height={300}
            ariaLabel="Churn rate by plan"
            buildOption={churnOption}
            fallbackTable={
              <DataTable
                caption="Churn rate by plan"
                columns={["Plan", "Churn %", "Subscribers"]}
                rows={telecom.churn_signals.map((r) => [r.plan_id, r.churn_rate, r.subscribers])}
              />
            }
          />
        </figure>
      </div>

      <figure className="demo-card mt-4">
        <figcaption className="mb-2 text-sm font-semibold">Call volume by weekday &amp; hour</figcaption>
        <EChart
          height={300}
          ariaLabel="Call volume heatmap by weekday and hour"
          buildOption={heatmapOption}
          fallbackTable={
            <DataTable
              caption="Call volume by weekday and hour (top cells)"
              columns={["Weekday", "Hour", "Calls"]}
              rows={telecom.usage_heatmap.data
                .slice()
                .sort((a, b) => b[2] - a[2])
                .slice(0, 12)
                .map((c) => [telecom.usage_heatmap.days[c[1]], telecom.usage_heatmap.hours[c[0]], c[2]])}
            />
          }
        />
      </figure>
    </div>
  );
}
