import type { JSX } from "react";
import EChart from "./EChart";
import ChartCard, { type Provenance } from "./ChartCard";
import KpiCard from "./KpiCard";
import { axisLabel, grid, legend, motion, splitLine, tooltip, type VizMode, type VizTokens } from "./theme";
import { corpus } from "../../data/artifacts";

/**
 * SQL analyzer dashboard over the real corpus and analyze() output (no
 * simulated cost reductions — the project hasn't measured any). Findings by
 * severity per query, and the structural complexity the rules respond to.
 */

const PROV: Provenance = {
  label: "Real corpus · analyze() output",
  title: corpus._meta.note,
  kind: "real",
};
const Q = corpus.queries;
const label = (q: (typeof Q)[number]) => `${String(q.n).padStart(2, "0")} ${q.category.replace(/_/g, " ")}`;
const SEVERITIES = ["info", "warn", "high"] as const;

function findingsOption(t: VizTokens, _m: VizMode, reduced: boolean) {
  const colors = { info: t.accent, warn: t.warn, high: t.danger };
  const rows = [...Q].reverse();
  return {
    ...motion(reduced),
    grid: grid({ top: 36 }),
    legend: legend(t, { top: 0, left: 0 }),
    tooltip: tooltip(t, { trigger: "axis", axisPointer: { type: "shadow" } }),
    xAxis: { type: "value", minInterval: 1, max: 3, axisLabel: axisLabel(t), splitLine: splitLine(t) },
    yAxis: { type: "category", data: rows.map(label), axisLabel: axisLabel(t, { color: t.fg }), axisTick: { show: false }, axisLine: { show: false } },
    series: SEVERITIES.map((sev, i) => ({
      name: sev,
      type: "bar",
      stack: "f",
      barMaxWidth: 22,
      itemStyle: { color: colors[sev], borderColor: t.surface, borderWidth: 2, borderRadius: i === SEVERITIES.length - 1 ? [0, 4, 4, 0] : 0 },
      emphasis: { focus: "series" },
      data: rows.map((q) => q.findings.filter((f) => f.severity === sev).length),
    })),
  };
}

function complexityOption(t: VizTokens, _m: VizMode, reduced: boolean) {
  const metrics = [
    { k: "tables" as const, name: "Tables" },
    { k: "ctes" as const, name: "CTEs" },
    { k: "joins" as const, name: "Joins" },
  ];
  return {
    ...motion(reduced),
    grid: grid({ top: 36 }),
    legend: legend(t, { top: 0, left: 0 }),
    tooltip: tooltip(t, { trigger: "axis", axisPointer: { type: "shadow" } }),
    xAxis: { type: "category", data: Q.map((q) => String(q.n).padStart(2, "0")), axisLabel: axisLabel(t, { color: t.fg }), axisTick: { show: false }, axisLine: { lineStyle: { color: t.border } } },
    yAxis: { type: "value", minInterval: 1, axisLabel: axisLabel(t), splitLine: splitLine(t) },
    series: metrics.map((m, i) => ({
      name: m.name,
      type: "bar",
      barGap: "12%",
      barMaxWidth: 18,
      itemStyle: { color: t.series[i], borderRadius: [4, 4, 0, 0] },
      emphasis: { focus: "series" },
      data: Q.map((q) => q.stats[m.k]),
    })),
  };
}

export default function SqlOptDashboard(): JSX.Element {
  const s = corpus.summary;
  const totalFindings = Q.reduce((a, q) => a + q.findings.length, 0);
  const high = Q.reduce((a, q) => a + q.findings.filter((f) => f.severity === "high").length, 0);
  const mostComplex = [...Q].sort((a, b) => b.stats.ctes + b.stats.joins - (a.stats.ctes + a.stats.joins))[0];
  const ruleCount = corpus.rules.filter((r) => r.id !== "parse_error").length;
  const fired = s.rulesFired.length;

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Corpus" value={`${s.queries} queries`} sub="one per optimization category" tone="accent" />
        <KpiCard label="With findings" value={`${s.queriesWithFindings} / ${s.queries}`} sub={`${totalFindings} findings in total`} />
        <KpiCard label="Rules exercised" value={`${fired} / ${ruleCount}`} sub={s.rulesNeverFired.filter((r) => r !== "parse_error").join(", ") + " never fire"} tone="warn" />
        <KpiCard label="Keyword overlap" value={s.meanKeywordOverlap.toFixed(2)} sub="analyzer findings only" />
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <ChartCard
          id="sql-findings"
          title="Analyzer findings per query, by severity"
          subtitle="Exactly what analyze() reports when run the way the benchmark runs it"
          provenance={PROV}
          takeaway={
            high === 0 ? (
              <>No high-severity finding fires anywhere: the two high rules (cross join, missing partition predicate) are the two the corpus never triggers.</>
            ) : (
              <>{high} high-severity findings across the corpus.</>
            )
          }
          table={{ caption: "Findings per query", columns: ["Query", "info", "warn", "high", "Rules"], rows: Q.map((q) => [label(q), ...SEVERITIES.map((sev) => q.findings.filter((f) => f.severity === sev).length), q.findings.map((f) => f.rule).join(", ") || "—"]) }}
          height={240}
          renderChart={(h) => <EChart buildOption={findingsOption} height={h} ariaLabel={`Stacked bars of findings per corpus query by severity; ${totalFindings} findings in total.`} />}
        />
        <ChartCard
          id="sql-complexity"
          title="Query structure the rules react to"
          subtitle="Tables, CTEs and joins per corpus query (sqlglot AST)"
          provenance={PROV}
          takeaway={<>Query {String(mostComplex.n).padStart(2, "0")} ({mostComplex.category.replace(/_/g, " ")}) carries {mostComplex.stats.ctes} CTEs and {mostComplex.stats.joins} joins from a single source table — the shape the flattening rewrite removes.</>}
          table={{ caption: "Query structure", columns: ["Query", "Tables", "CTEs", "Joins", "Lines"], rows: Q.map((q) => [label(q), q.stats.tables, q.stats.ctes, q.stats.joins, q.stats.lines]) }}
          height={240}
          renderChart={(h) => <EChart buildOption={complexityOption} height={h} ariaLabel="Grouped bars of tables, CTEs and joins per corpus query." />}
        />
      </div>
    </div>
  );
}
