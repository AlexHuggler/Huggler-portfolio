import type { JSX } from "react";
import EChart from "../viz/EChart";
import ChartCard from "../viz/ChartCard";
import { axisLabel, grid, legend, motion, splitLine, tooltip, withAlpha, type VizMode, type VizTokens } from "../viz/theme";
import { corpus } from "../../data/artifacts";

/**
 * Which ground-truth keywords does the analyzer actually earn? For each real
 * corpus query, keywords split into: matched in analyzer findings (all the
 * scorer counts), present only in the query's own text (which the scorer
 * ignores), and missed. Real data from sqlopt.py.
 */

const ROWS = corpus.queries.map((q) => {
  const inFindings = q.keywordHits.filter((k) => k.inFindings).length;
  const textOnly = q.keywordHits.filter((k) => !k.inFindings && k.inQueryText).length;
  const missed = q.keywordHits.length - inFindings - textOnly;
  return { label: `${String(q.n).padStart(2, "0")} ${q.category.replace(/_/g, " ")}`, inFindings, textOnly, missed, total: q.keywordHits.length };
});
const TOTAL = ROWS.reduce((a, r) => a + r.total, 0);
const IN_FINDINGS = ROWS.reduce((a, r) => a + r.inFindings, 0);
const TEXT_ONLY = ROWS.reduce((a, r) => a + r.textOnly, 0);

function buildOption(t: VizTokens, _mode: VizMode, reduced: boolean) {
  const rows = [...ROWS].reverse();
  const seg = (name: string, key: "inFindings" | "textOnly" | "missed", color: string, last = false) => ({
    name,
    type: "bar" as const,
    stack: "kw",
    barMaxWidth: 22,
    data: rows.map((r) => r[key]),
    itemStyle: {
      color,
      borderColor: t.surface,
      borderWidth: 1,
      borderRadius: last ? [0, 4, 4, 0] : 0,
    },
    emphasis: { focus: "series" as const },
  });
  return {
    ...motion(reduced),
    grid: grid({ left: 8, right: 20, top: 40, bottom: 8 }),
    legend: legend(t, { top: 0, left: 0 }),
    tooltip: tooltip(t, { trigger: "axis", axisPointer: { type: "shadow" } }),
    xAxis: {
      type: "value",
      max: 3,
      interval: 1,
      axisLabel: axisLabel(t),
      splitLine: splitLine(t),
    },
    yAxis: {
      type: "category",
      data: rows.map((r) => r.label),
      axisLabel: axisLabel(t, { color: t.fg }),
      axisLine: { show: false },
      axisTick: { show: false },
    },
    series: [
      seg("In findings", "inFindings", t.series[0]),
      seg("Query text only", "textOnly", t.series[1]),
      seg("Missed", "missed", withAlpha(t.muted, 0.3), true),
    ],
  };
}

export default function KeywordAttributionChart(): JSX.Element {
  return (
    <ChartCard
      id="keyword-attribution"
      title="Ground-truth keywords: earned by findings vs. already in the query"
      subtitle="Each bar is one corpus query; segments count its expected keywords."
      provenance={{
        label: "Real corpus · make benchmark",
        title: "Computed from the real corpus, ground_truth.yaml, and analyze() output by scripts/artifacts/sqlopt.py.",
        kind: "real",
      }}
      takeaway={
        <>
          {IN_FINDINGS} of {TOTAL} expected keywords appear in analyzer findings, the only place the
          scorer looks. {TEXT_ONLY} more appear only in the query's own text, which it does not count.
        </>
      }
      table={{
        caption: "Keyword attribution per corpus query",
        columns: ["Query", "In findings", "Query text only", "Missed"],
        rows: ROWS.map((r) => [r.label, r.inFindings, r.textOnly, r.missed]),
      }}
      height={260}
      renderChart={(h) => (
        <EChart
          buildOption={buildOption}
          height={h}
          ariaLabel={`Stacked bars per corpus query: ${IN_FINDINGS} of ${TOTAL} ground-truth keywords matched in analyzer findings, ${TEXT_ONLY} matched only in query text.`}
        />
      )}
    />
  );
}
