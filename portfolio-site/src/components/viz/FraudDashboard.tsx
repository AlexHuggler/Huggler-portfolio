import type { JSX } from "react";
import { useCallback, useMemo, useState } from "react";
import EChart from "./EChart";
import ChartCard, { type Provenance } from "./ChartCard";
import KpiCard from "./KpiCard";
import { axisLabel, grid, legend, lineStyle, motion, splitLine, tooltip, withAlpha, type VizMode, type VizTokens } from "./theme";
import { fraudDashboard as d, type FraudLabel } from "../../data/artifacts";

/**
 * Fraud detection dashboard over the real `make eval` set (aggregated by
 * scripts/artifacts/fraud.py): account-level detector outcomes, when labeled
 * fraud and detector flags occur in the stream, how fraud labels distribute
 * by amount, and the producer quirk in impossible-travel destinations.
 * A pattern filter scopes the amount and timeline views.
 */

const PROV: Provenance = {
  label: "Real make eval set · seed 42",
  title: d._meta.note,
  kind: "real",
};
const PATTERNS: Exclude<FraudLabel, "normal">[] = ["velocity_burst", "impossible_travel", "amount_outlier"];
const PATTERN_TEXT: Record<FraudLabel, string> = {
  normal: "Normal",
  velocity_burst: "Velocity burst",
  impossible_travel: "Impossible travel",
  amount_outlier: "Amount outlier",
};
const KIND_TEXT = { velocity: "Velocity", geo: "Impossible travel", amount: "Amount z-score" } as const;
const pct = (n: number, digits = 1) => `${(n * 100).toFixed(digits)}%`;

export default function FraudDashboard(): JSX.Element {
  const [pattern, setPattern] = useState<"all" | Exclude<FraudLabel, "normal">>("all");
  const scoped = (row: Record<FraudLabel, number>) =>
    pattern === "all" ? PATTERNS.reduce((a, p) => a + row[p], 0) : row[pattern];

  const outcomes = useCallback((t: VizTokens, _m: VizMode, reduced: boolean) => {
    const rows = [...d.scores].reverse();
    const seg = (name: string, color: string, values: number[], last = false) => ({
      name,
      type: "bar",
      stack: "o",
      barMaxWidth: 24,
      itemStyle: { color, borderColor: t.surface, borderWidth: 2, borderRadius: last ? [0, 4, 4, 0] : 0 },
      emphasis: { focus: "series" },
      data: values,
    });
    return {
      ...motion(reduced),
      grid: grid({ top: 36 }),
      legend: legend(t, { top: 0, left: 0 }),
      tooltip: tooltip(t, { trigger: "axis", axisPointer: { type: "shadow" } }),
      xAxis: { type: "value", name: "accounts", nameTextStyle: { color: t.muted, fontSize: 10 }, axisLabel: axisLabel(t), splitLine: splitLine(t) },
      yAxis: { type: "category", data: rows.map((s) => KIND_TEXT[s.kind]), axisLabel: axisLabel(t, { color: t.fg }), axisTick: { show: false }, axisLine: { show: false } },
      series: [
        seg("Caught (true +)", t.success, rows.map((s) => s.truePositives)),
        seg("Missed (false −)", t.danger, rows.map((s) => s.trueAccounts - s.truePositives)),
        seg("False alarms (false +)", t.warn, rows.map((s) => s.flaggedAccounts - s.truePositives), true),
      ],
    };
  }, []);

  const timeline = useCallback(
    (t: VizTokens, _m: VizMode, reduced: boolean) => ({
      ...motion(reduced),
      grid: grid({ top: 36, bottom: 24 }),
      legend: legend(t, { top: 0, left: 0 }),
      tooltip: tooltip(t, { trigger: "axis" }),
      xAxis: {
        type: "category",
        data: d.timeline.map((r) => `${r.t}s`),
        boundaryGap: false,
        axisLabel: axisLabel(t, { interval: 11 }),
        axisLine: { lineStyle: { color: t.border } },
      },
      yAxis: { type: "value", axisLabel: axisLabel(t), splitLine: splitLine(t) },
      series: [
        { name: "Labeled fraud", type: "line", data: d.timeline.map((r) => r.labeled), ...lineStyle(t, t.series[1], true) },
        { name: "Detector flags", type: "line", data: d.timeline.map((r) => r.flagged), ...lineStyle(t, t.series[0]) },
      ],
    }),
    [],
  );

  const amounts = useCallback(
    (t: VizTokens, _m: VizMode, reduced: boolean) => {
      const share = d.amountBuckets.map((b) => {
        const total = PATTERNS.reduce((a, p) => a + b[p], 0) + b.normal;
        return total ? (100 * scoped(b)) / total : 0;
      });
      return {
        ...motion(reduced),
        grid: grid({ top: 16 }),
        tooltip: tooltip(t, { trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: (v: unknown) => `${Number(v).toFixed(1)}%` }),
        xAxis: { type: "category", data: d.amountBuckets.map((b) => `$${b.bucket}`), axisLabel: axisLabel(t), axisTick: { show: false }, axisLine: { lineStyle: { color: t.border } } },
        yAxis: { type: "value", max: 100, axisLabel: axisLabel(t, { formatter: "{value}%" }), splitLine: splitLine(t) },
        series: [{
          name: pattern === "all" ? "Labeled fraud share" : `${PATTERN_TEXT[pattern]} share`,
          type: "bar",
          barMaxWidth: 28,
          data: share.map((v) => +v.toFixed(2)),
          itemStyle: { color: t.series[1], borderRadius: [4, 4, 0, 0] },
        }],
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pattern],
  );

  const travel = useCallback((t: VizTokens, _m: VizMode, reduced: boolean) => {
    const rows = d.countries.map((c) => ({ c, v: d.travelDestinations[c] ?? 0 })).sort((a, b) => a.v - b.v);
    return {
      ...motion(reduced),
      grid: grid({ top: 8, right: 40 }),
      tooltip: tooltip(t, { trigger: "item" }),
      xAxis: { type: "value", axisLabel: axisLabel(t), splitLine: splitLine(t) },
      yAxis: { type: "category", data: rows.map((r) => r.c), axisLabel: axisLabel(t, { color: t.fg }), axisTick: { show: false }, axisLine: { show: false } },
      series: [{
        type: "bar",
        name: "Hops into country",
        barMaxWidth: 16,
        data: rows.map((r) => ({ value: r.v, itemStyle: { color: r.v ? t.series[0] : withAlpha(t.muted, 0.2), borderRadius: [0, 4, 4, 0] } })),
        label: { show: true, position: "right", color: t.muted, fontSize: 10, formatter: (p: { value: number }) => (p.value ? String(p.value) : "0") },
      }],
    };
  }, []);

  const categories = useCallback((t: VizTokens, _m: VizMode, reduced: boolean) => {
    const rows = [...d.byCategory].sort((a, b) => a.labeledShare - b.labeledShare);
    return {
      ...motion(reduced),
      grid: grid({ top: 8, right: 48 }),
      tooltip: tooltip(t, { trigger: "item", valueFormatter: (v: unknown) => `${Number(v).toFixed(1)}%` }),
      xAxis: { type: "value", axisLabel: axisLabel(t, { formatter: "{value}%" }), splitLine: splitLine(t) },
      yAxis: { type: "category", data: rows.map((r) => r.category.replace(/_/g, " ")), axisLabel: axisLabel(t, { color: t.fg }), axisTick: { show: false }, axisLine: { show: false } },
      series: [{
        type: "bar",
        name: "Labeled share",
        barMaxWidth: 16,
        data: rows.map((r) => +(r.labeledShare * 100).toFixed(2)),
        itemStyle: { color: t.series[0], borderRadius: [0, 4, 4, 0] },
        label: { show: true, position: "right", color: t.muted, fontSize: 10, formatter: (p: { value: number }) => `${p.value.toFixed(1)}%` },
      }],
    };
  }, []);

  // derived takeaways
  const velocity = d.scores.find((s) => s.kind === "velocity")!;
  const highBucket = d.amountBuckets.reduce((a, b) => {
    const tot = (x: typeof b) => PATTERNS.reduce((s, p) => s + x[p], 0) + x.normal;
    return scoped(b) / Math.max(1, tot(b)) > scoped(a) / Math.max(1, tot(a)) ? b : a;
  });
  const travelTop = Object.entries(d.travelDestinations).sort((a, b) => b[1] - a[1]);
  const travelTotal = travelTop.reduce((a, [, v]) => a + v, 0);
  const catShares = d.byCategory.map((c) => c.labeledShare);
  const catSpread = Math.max(...catShares) - Math.min(...catShares);
  const peakFlag = d.timeline.reduce((a, b) => (b.flagged > a.flagged ? b : a));

  const filter = useMemo(
    () => (
      <div className="segmented flex-wrap" role="group" aria-label="Fraud pattern">
        {(["all", ...PATTERNS] as const).map((p) => (
          <button key={p} type="button" aria-pressed={pattern === p} onClick={() => setPattern(p)} className="!text-xs">
            {p === "all" ? "All patterns" : PATTERN_TEXT[p]}
          </button>
        ))}
      </div>
    ),
    [pattern],
  );

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard label="Events scored" value={d.kpis.events.toLocaleString("en-US")} sub={`${d.kpis.accounts.toLocaleString("en-US")} accounts · 300 s at 50/s`} tone="accent" />
        <KpiCard label="Labeled fraud" value={pct(d.kpis.labeledEventShare)} sub={`${d.kpis.labeledEvents.toLocaleString("en-US")} events; 5% of producer decisions`} tone="warn" />
        <KpiCard label="Events flagged" value={d.kpis.flaggedEvents.toLocaleString("en-US")} sub="by any detector" />
        <KpiCard label="Accounts flagged" value={d.kpis.flaggedAccounts.toLocaleString("en-US")} sub={`of ${d.kpis.accounts.toLocaleString("en-US")} — velocity drives most`} tone="danger" />
        <KpiCard label="Velocity precision" value={velocity.precision.toFixed(2)} sub="recall 1.00 at the shipped threshold" />
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <ChartCard
          id="fraud-outcomes"
          title="Detector outcomes, account level"
          subtitle="Caught vs missed labeled accounts, and false alarms"
          provenance={PROV}
          takeaway={<>Velocity raises {velocity.flaggedAccounts - velocity.truePositives} false alarms to catch {velocity.truePositives} accounts; impossible travel is clean, and the z-score rule's cost is misses, not noise.</>}
          table={{ caption: "Detector outcomes", columns: ["Detector", "Caught", "Missed", "False alarms", "Precision", "Recall"], rows: d.scores.map((s) => [KIND_TEXT[s.kind], s.truePositives, s.trueAccounts - s.truePositives, s.flaggedAccounts - s.truePositives, s.precision.toFixed(2), s.recall.toFixed(2)]) }}
          height={240}
          renderChart={(h) => <EChart buildOption={outcomes} height={h} ariaLabel="Stacked bars per detector: caught, missed and false-alarm accounts." />}
        />
        <ChartCard
          id="fraud-timeline"
          title="Labeled fraud vs detector flags over the run"
          subtitle={`Events per ${d.bucketSec}-second bucket, in event time`}
          provenance={PROV}
          takeaway={<>Flags cluster early (peak {peakFlag.flagged} at {peakFlag.t}s): the velocity rule fires once per account, as soon as a 60-second window crosses the threshold.</>}
          table={{ caption: "Timeline", columns: ["t (s)", "Events", "Labeled", "Flagged"], rows: d.timeline.map((r) => [r.t, r.events, r.labeled, r.flagged]) }}
          height={240}
          renderChart={(h) => <EChart buildOption={timeline} height={h} ariaLabel="Lines of labeled fraud events and detector flags over the evaluation run." />}
        />
        <ChartCard
          id="fraud-amounts"
          title="Fraud share by transaction amount"
          subtitle="Share of events in each amount bucket that carry the selected label"
          provenance={PROV}
          controls={filter}
          takeaway={
            pattern === "impossible_travel" ? (
              <>Impossible-travel events carry ordinary amounts — their share peaks in the ${highBucket.bucket} bucket only because that's where normal spend sits. Amount alone can't find them.</>
            ) : (
              <>The {pattern === "all" ? "labeled-fraud" : PATTERN_TEXT[pattern].toLowerCase()} share peaks in the ${highBucket.bucket} bucket — the producer prices bursts at 3–8× and outliers at +6σ of each account's mean.</>
            )
          }
          table={{ caption: "Amount buckets by label", columns: ["Bucket", "Normal", ...PATTERNS.map((p) => PATTERN_TEXT[p])], rows: d.amountBuckets.map((b) => [b.bucket, b.normal, ...PATTERNS.map((p) => b[p])]) }}
          height={240}
          renderChart={(h) => <EChart buildOption={amounts} height={h} ariaLabel="Bars of fraud share by amount bucket for the selected pattern." />}
        />
        <ChartCard
          id="fraud-travel"
          title="Where impossible-travel hops land"
          subtitle="Destination country of each labeled country change"
          provenance={PROV}
          takeaway={<>{pct(travelTop[0][1] / travelTotal, 0)} of hops land in {travelTop[0][0]}: the producer picks the first country that differs from the last, a quirk worth randomising before trusting geo features.</>}
          table={{ caption: "Impossible-travel destinations", columns: ["Country", "Hops"], rows: d.countries.map((c) => [c, d.travelDestinations[c] ?? 0]) }}
          height={300}
          renderChart={(h) => <EChart buildOption={travel} height={h} ariaLabel={`Bars of impossible-travel destinations; ${travelTop[0][0]} receives most hops.`} />}
        />
        <ChartCard
          id="fraud-category"
          title="Labeled share by merchant category"
          subtitle="Share of each category's events that carry any fraud label"
          provenance={PROV}
          takeaway={<>Shares sit within {(catSpread * 100).toFixed(1)} points of each other — categories are drawn uniformly, so merchant category carries no signal in this data.</>}
          table={{ caption: "Labeled share by category", columns: ["Category", "Events", "Labeled share"], rows: d.byCategory.map((c) => [c.category, c.total, pct(c.labeledShare)]) }}
          height={300}
          className="xl:col-span-2"
          renderChart={(h) => <EChart buildOption={categories} height={h} ariaLabel="Bars of labeled-fraud share by merchant category." />}
        />
      </div>
    </div>
  );
}
