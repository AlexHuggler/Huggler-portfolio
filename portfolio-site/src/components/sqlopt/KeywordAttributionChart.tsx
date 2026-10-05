import type { JSX } from "react";
import EChart from "../viz/EChart";
import ChartCard from "../viz/ChartCard";
import { axisLabel, grid, legend, motion, splitLine, tooltip, withAlpha, type VizMode, type VizTokens } from "../viz/theme";
import { corpus } from "../../data/artifacts";

/**
 * Which ground-truth keywords does the benchmark credit? For each real
 * corpus query, expected keywords split into: matched in analyzer findings
 * (credited), present only in the query's own text (not credited - the
 * scorer never searches the input), and missed. Real data from sqlopt.py.
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
      seg("Only in query text (not credited)", "textOnly", t.series[1]),
      seg("Missed", "missed", withAlpha(t.muted, 0.3), true),
    ],
  };
}

export default function KeywordAttributionChart(): JSX.Element {
  return (
    <ChartCard
      id="keyword-attribution"
      title="Ground-truth keywords: credited from findings, or not"
      subtitle="Each bar is one corpus query; segments count its expected keywords."
      provenance={{
        label: "Real corpus · make benchmark",
        title: "Computed from the real corpus, ground_truth.yaml, and analyze() output by scripts/artifacts/sqlopt.py.",
        kind: "real",
      }}
      takeaway={
        <>
          {IN_FINDINGS} of {TOTAL} expected keywords appear in analyzer findings and are credited;
          {TEXT_ONLY} more appear only in the query's own text, which the scorer does not search.
        </>
      }
      table={{
        caption: "Keyword attribution per corpus query",
        columns: ["Query", "In findings", "Only in query text (not credited)", "Missed"],
        rows: ROWS.map((r) => [r.label, r.inFindings, r.textOnly, r.missed]),
      }}
      height={260}
      renderChart={(h) => (
        <EChart
          buildOption={buildOption}
          height={h}
          ariaLabel={`Stacked bars per corpus query: ${IN_FINDINGS} of ${TOTAL} ground-truth keywords credited from analyzer findings, ${TEXT_ONLY} present only in query text and not credited.`}
        />
      )}
    />
  );
}
