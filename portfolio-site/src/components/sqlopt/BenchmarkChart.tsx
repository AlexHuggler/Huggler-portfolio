import type { JSX } from "react";
import EChart from "../viz/EChart";
import {
  axisLabel,
  splitLine,
  tooltip,
  type VizMode,
  type VizTokens,
} from "../viz/theme";
import optimizations from "../../data/sql-optimizations.json";

/**
 * BenchmarkChart
 *
 * Horizontal bar chart of illustrative cost-reduction estimates per query
 * in the fixture, rendered with the shared ECharts wrapper so it follows
 * the design tokens and restyles live on theme toggle.
 */

interface FixtureRow {
  id: string;
  title: string;
  estimated_cost_reduction_pct: number;
}

interface Fixture {
  queries: FixtureRow[];
}

const ROWS = (optimizations as Fixture).queries.map((q) => ({
  id: q.id,
  title: q.title,
  pct: q.estimated_cost_reduction_pct,
}));

function buildOption(
  t: VizTokens,
  _mode: VizMode,
  reduced: boolean,
) {
  // Reverse so the first query renders at the top of the category axis.
  const rows = [...ROWS].reverse();
  return {
    animation: !reduced,
    animationDuration: 400,
    grid: { left: 8, right: 40, top: 8, bottom: 8, containLabel: true },
    tooltip: tooltip(t, {
      trigger: "item",
      valueFormatter: (v: unknown) => `${v}% est. reduction`,
    }),
    xAxis: {
      type: "value",
      max: 100,
      axisLabel: { ...axisLabel(t), formatter: "{value}%" },
      splitLine: splitLine(t),
    },
    yAxis: {
      type: "category",
      data: rows.map((r) => r.title),
      axisLabel: { ...axisLabel(t), width: 150, overflow: "truncate" },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    series: [
      {
        name: "Est. reduction",
        type: "bar",
        barWidth: 18,
        data: rows.map((r) => r.pct),
        itemStyle: { color: t.accent, borderRadius: [0, 4, 4, 0] },
        label: {
          show: true,
          position: "insideRight",
          formatter: "{c}%",
          color: "#ffffff",
          fontFamily: "JetBrains Mono Variable, ui-monospace, Menlo, monospace",
          fontSize: 11,
        },
      },
    ],
  };
}

export default function BenchmarkChart(): JSX.Element {
  return (
    <div className="demo-card">
      <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold tracking-tight">
            Estimated cost reduction by query
          </h3>
          <p className="text-xs text-muted">
            Illustrative cost-reduction estimates &mdash; see methodology below
          </p>
        </div>
        <span
          className="data-chip"
          title="Cost reductions are illustrative estimates from the seeded demo fixture, not production measurements."
        >
          Synthetic demo data
        </span>
      </header>
      <EChart
        buildOption={buildOption}
        height={288}
        ariaLabel="Horizontal bar chart of estimated cost reduction per corpus query"
      />
      <p className="mt-2 text-[11px] text-muted">
        Numbers reflect planner heuristics on the seeded benchmark corpus,
        not production runs. EXPLAIN-based scoring noted in the repo.
      </p>
      <table className="visually-hidden">
        <caption>Estimated cost reduction by query</caption>
        <thead>
          <tr>
            <th>Query</th>
            <th>Estimated cost reduction</th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map((r) => (
            <tr key={r.id}>
              <td>{r.title}</td>
              <td>{r.pct}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
