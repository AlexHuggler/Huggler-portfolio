import type { JSX } from "react";
import EChart from "./EChart";
import KpiCard from "./KpiCard";
import DataTable from "./DataTable";
import {
  axisLabel,
  axisLine,
  grid,
  splitLine,
  tooltip,
  type VizTokens,
} from "./theme";
import sqlopt from "../../data/viz/sqlopt.json";

const CATEGORIES = [
  "join_optimization",
  "aggregation_rewrite",
  "cte_flattening",
  "partition_pruning",
  "broadcast_join",
];
const CATEGORY_LABEL: Record<string, string> = {
  join_optimization: "Join opt",
  aggregation_rewrite: "Aggregation",
  cte_flattening: "CTE flatten",
  partition_pruning: "Partition prune",
  broadcast_join: "Broadcast",
};

function catColor(t: VizTokens, category: string): string {
  return t.series[CATEGORIES.indexOf(category) % t.series.length];
}

const SEVERITY_COLOR: Record<string, string> = {
  high: "#ef4444",
  warn: "#f59e0b",
  info: "#2563eb",
};

// --- option builders (module scope => stable identity) --------------------

function costReductionOption(t: VizTokens) {
  const rows = sqlopt.cost_reduction;
  const avg = rows.reduce((s, r) => s + r.reduction_pct, 0) / rows.length;
  return {
    grid: grid({ bottom: 24 }),
    tooltip: tooltip(t, {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      formatter: (p: any) => {
        const r = rows[p[0].dataIndex];
        return `Query ${r.query_id} · ${CATEGORY_LABEL[r.category]}<br/>Cost reduction: ${r.reduction_pct}%`;
      },
    }),
    xAxis: {
      type: "category",
      data: rows.map((r) => r.query_id),
      axisLabel: { ...axisLabel(t), interval: 4 },
      axisLine: axisLine(t),
      name: "query",
      nameTextStyle: { color: t.muted, fontSize: 10 },
    },
    yAxis: {
      type: "value",
      name: "reduction %",
      nameTextStyle: { color: t.muted, fontSize: 10 },
      axisLabel: axisLabel(t),
      axisLine: axisLine(t),
      splitLine: splitLine(t),
    },
    series: [
      {
        type: "bar",
        data: rows.map((r) => ({
          value: r.reduction_pct,
          itemStyle: { color: catColor(t, r.category) },
        })),
        markLine: {
          silent: true,
          symbol: "none",
          lineStyle: { color: t.fg, type: "dashed" },
          label: { color: t.fg, formatter: `median ${sqlopt.kpis.median_cost_reduction_pct}%` },
          data: [{ yAxis: avg }],
        },
      },
    ],
  };
}

function byCategoryOption(t: VizTokens) {
  const rows = sqlopt.by_category;
  return {
    grid: grid({ bottom: 40 }),
    tooltip: tooltip(t, {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      formatter: (p: any) => {
        const r = rows[p[0].dataIndex];
        return `<b>${CATEGORY_LABEL[r.category]}</b><br/>Median: ${r.median}%<br/>Range: ${r.min}% – ${r.max}%<br/>${r.count} queries`;
      },
    }),
    xAxis: {
      type: "category",
      data: rows.map((r) => CATEGORY_LABEL[r.category]),
      axisLabel: { ...axisLabel(t), rotate: 20 },
      axisLine: axisLine(t),
    },
    yAxis: {
      type: "value",
      name: "median reduction %",
      nameTextStyle: { color: t.muted, fontSize: 10 },
      axisLabel: axisLabel(t),
      axisLine: axisLine(t),
      splitLine: splitLine(t),
    },
    series: [
      {
        type: "bar",
        barWidth: "50%",
        data: rows.map((r) => ({
          value: r.median,
          itemStyle: { color: catColor(t, r.category), borderRadius: [3, 3, 0, 0] },
        })),
      },
    ],
  };
}

function distributionOption(t: VizTokens) {
  const rows = sqlopt.reduction_distribution;
  return {
    grid: grid({ bottom: 24 }),
    tooltip: tooltip(t, { trigger: "axis", axisPointer: { type: "shadow" } }),
    xAxis: {
      type: "category",
      data: rows.map((r) => r.bucket),
      axisLabel: axisLabel(t),
      axisLine: axisLine(t),
      name: "reduction %",
      nameTextStyle: { color: t.muted, fontSize: 10 },
    },
    yAxis: {
      type: "value",
      name: "queries",
      nameTextStyle: { color: t.muted, fontSize: 10 },
      axisLabel: axisLabel(t),
      axisLine: axisLine(t),
      splitLine: splitLine(t),
    },
    series: [
      {
        type: "bar",
        data: rows.map((r) => r.count),
        itemStyle: { color: t.accent, borderRadius: [3, 3, 0, 0] },
        barWidth: "62%",
      },
    ],
  };
}

function findingsOption(t: VizTokens) {
  const rows = sqlopt.findings_by_rule;
  return {
    grid: grid({ left: 8, right: 24 }),
    tooltip: tooltip(t, {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      formatter: (p: any) => {
        const r = rows[p[0].dataIndex];
        return `<b>${r.rule}</b><br/>${r.count} findings · ${r.severity}`;
      },
    }),
    xAxis: {
      type: "value",
      axisLabel: axisLabel(t),
      axisLine: axisLine(t),
      splitLine: splitLine(t),
    },
    yAxis: {
      type: "category",
      inverse: true,
      data: rows.map((r) => r.rule),
      axisLabel: axisLabel(t),
      axisLine: axisLine(t),
    },
    series: [
      {
        type: "bar",
        data: rows.map((r) => ({
          value: r.count,
          itemStyle: { color: SEVERITY_COLOR[r.severity] ?? t.accent, borderRadius: [0, 3, 3, 0] },
        })),
        barWidth: "58%",
      },
    ],
  };
}

function beforeAfterOption(t: VizTokens) {
  const rows = sqlopt.cost_reduction;
  const maxCost = Math.max(...rows.map((r) => r.cost_before));
  return {
    grid: grid({ left: 8, right: 16, bottom: 32 }),
    tooltip: tooltip(t, {
      trigger: "item",
      formatter: (p: any) => {
        const r = rows[p.dataIndex];
        return `Query ${r.query_id} · ${CATEGORY_LABEL[r.category]}<br/>Before: ${r.cost_before.toLocaleString()}<br/>After: ${r.cost_after.toLocaleString()}`;
      },
    }),
    xAxis: {
      type: "value",
      name: "cost before",
      nameTextStyle: { color: t.muted, fontSize: 10 },
      axisLabel: { ...axisLabel(t), formatter: (v: number) => `${(v / 1000).toFixed(0)}k` },
      axisLine: axisLine(t),
      splitLine: splitLine(t),
    },
    yAxis: {
      type: "value",
      name: "cost after",
      nameTextStyle: { color: t.muted, fontSize: 10 },
      axisLabel: { ...axisLabel(t), formatter: (v: number) => `${(v / 1000).toFixed(0)}k` },
      axisLine: axisLine(t),
      splitLine: splitLine(t),
    },
    series: [
      {
        type: "scatter",
        symbolSize: 9,
        data: rows.map((r) => ({
          value: [r.cost_before, r.cost_after],
          itemStyle: { color: catColor(t, r.category), opacity: 0.85 },
        })),
        markLine: {
          silent: true,
          symbol: "none",
          lineStyle: { color: t.muted, type: "dashed" },
          label: { color: t.muted, formatter: "break-even", position: "end" },
          data: [[{ coord: [0, 0] }, { coord: [maxCost, maxCost] }]],
        },
      },
    ],
  };
}

// --------------------------------------------------------------------------

export default function SqlOptDashboard(): JSX.Element {
  const k = sqlopt.kpis;
  return (
    <div>
      <div className="mb-4">
        <span
          className="data-chip"
          title="Simulated 50-query optimization workload across 5 categories. Cost reductions and analyzer findings are illustrative."
        >
          Synthetic demo data · seed 42
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Corpus size" value={`${k.corpus_size}`} />
        <KpiCard label="Median cost cut" value={`${k.median_cost_reduction_pct}%`} accent="#10b981" />
        <KpiCard label="Win rate" value={`${k.win_rate_pct}%`} accent="#2563eb" />
        <KpiCard label="Findings / query" value={`${k.avg_findings_per_query}`} accent="#f59e0b" />
      </div>

      <figure className="demo-card mt-4">
        <figcaption className="mb-2 text-sm font-semibold">Cost reduction per query (colored by category)</figcaption>
        <EChart
          height={300}
          ariaLabel="Cost reduction per query, colored by optimization category"
          buildOption={costReductionOption}
          fallbackTable={
            <DataTable
              caption="Cost reduction per query"
              columns={["Query", "Category", "Reduction %"]}
              rows={sqlopt.cost_reduction.map((r) => [r.query_id, r.category, r.reduction_pct])}
            />
          }
        />
      </figure>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <figure className="demo-card">
          <figcaption className="mb-2 text-sm font-semibold">Median reduction by category</figcaption>
          <EChart
            height={290}
            ariaLabel="Median cost reduction by category"
            buildOption={byCategoryOption}
            fallbackTable={
              <DataTable
                caption="Median reduction by category"
                columns={["Category", "Median %", "Min %", "Max %", "Queries"]}
                rows={sqlopt.by_category.map((r) => [r.category, r.median, r.min, r.max, r.count])}
              />
            }
          />
        </figure>

        <figure className="demo-card">
          <figcaption className="mb-2 text-sm font-semibold">Reduction distribution</figcaption>
          <EChart
            height={290}
            ariaLabel="Distribution of cost reductions across the corpus"
            buildOption={distributionOption}
            fallbackTable={
              <DataTable
                caption="Reduction distribution"
                columns={["Bucket %", "Queries"]}
                rows={sqlopt.reduction_distribution.map((r) => [r.bucket, r.count])}
              />
            }
          />
        </figure>

        <figure className="demo-card">
          <figcaption className="mb-2 text-sm font-semibold">Analyzer findings by rule</figcaption>
          <EChart
            height={290}
            ariaLabel="Heuristic analyzer findings by rule and severity"
            buildOption={findingsOption}
            fallbackTable={
              <DataTable
                caption="Analyzer findings by rule"
                columns={["Rule", "Count", "Severity"]}
                rows={sqlopt.findings_by_rule.map((r) => [r.rule, r.count, r.severity])}
              />
            }
          />
        </figure>

        <figure className="demo-card">
          <figcaption className="mb-2 text-sm font-semibold">EXPLAIN cost: before vs after</figcaption>
          <EChart
            height={290}
            ariaLabel="EXPLAIN cost before versus after, per query"
            buildOption={beforeAfterOption}
            fallbackTable={
              <DataTable
                caption="EXPLAIN cost before vs after"
                columns={["Query", "Before", "After"]}
                rows={sqlopt.cost_reduction.map((r) => [r.query_id, r.cost_before, r.cost_after])}
              />
            }
          />
        </figure>
      </div>
    </div>
  );
}
