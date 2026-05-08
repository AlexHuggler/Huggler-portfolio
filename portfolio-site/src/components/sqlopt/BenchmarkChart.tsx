import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import optimizations from "../../data/sql-optimizations.json";

/**
 * BenchmarkChart
 *
 * Horizontal bar chart of illustrative cost-reduction estimates per query
 * in the fixture. Mount-gated to avoid Recharts' SSR width(-1) warnings;
 * provides a visually-hidden table fallback for accessibility.
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

const ACCENT = "#2563eb";

export default function BenchmarkChart() {
  const [mounted, setMounted] = useState<boolean>(false);
  useEffect(() => setMounted(true), []);

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
        <span className="placeholder-banner inline-block">
          illustrative
        </span>
      </header>
      <div className="h-72 w-full">
        {mounted && (
          <ResponsiveContainer
            width="100%"
            height="100%"
            minWidth={120}
            minHeight={120}
          >
            <BarChart
              data={ROWS}
              layout="vertical"
              margin={{ top: 4, right: 32, left: 4, bottom: 0 }}
            >
              <CartesianGrid
                stroke="rgba(148,163,184,0.1)"
                horizontal={false}
              />
              <XAxis
                type="number"
                domain={[0, 100]}
                tickLine={false}
                axisLine={false}
                tick={{ fill: "#64748b", fontSize: 10 }}
                tickFormatter={(v: number) => `${v}%`}
              />
              <YAxis
                type="category"
                dataKey="title"
                tickLine={false}
                axisLine={false}
                tick={{ fill: "#94a3b8", fontSize: 11 }}
                width={150}
              />
              <Tooltip
                cursor={{ fill: "rgba(37,99,235,0.06)" }}
                contentStyle={{
                  background: "rgba(10,10,10,0.95)",
                  border: "1px solid #1f1f23",
                  borderRadius: 6,
                  fontSize: 12,
                }}
                formatter={(value) => [`${value}%`, "Est. reduction"]}
              />
              <Bar
                dataKey="pct"
                fill={ACCENT}
                radius={[0, 4, 4, 0]}
                isAnimationActive={false}
              >
                <LabelList
                  dataKey="pct"
                  position="insideRight"
                  formatter={(label) => `${label ?? ""}%`}
                  style={{
                    fill: "#f8fafc",
                    fontSize: 11,
                    fontFamily: "JetBrains Mono, ui-monospace, Menlo, monospace",
                  }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
      <p className="mt-2 text-[11px] text-muted">
        Numbers reflect planner heuristics on the 50-query corpus, not
        production runs. EXPLAIN-based scoring noted in the repo.
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
